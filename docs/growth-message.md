# Growth message for the caregiver (NK-35, RF-14)

The caregiver sees a plain, non-technical message about the child's growth. The clinical alert is only communicated **after the professional has reviewed it**, with an orientation and the date of the next checkup.

## Endpoint

`GET /children/:childId/growth-message` (any user linked to the child; `403` without a link, `401` without a session).

```json
{
  "childId": "…",
  "status": "ok | reviewed",
  "concern": "below | above | null",
  "recommendation": "text | null",
  "nextCheckupDate": "YYYY-MM-DD | null",
  "reviewedAt": "ISO datetime | null"
}
```

The reading is recorded in the audit log as `READ` / `children`.

## Rules

- The message is built from the **latest alert of the child's current checkups** (a checkup that was corrected no longer counts).
- While that alert is `GENERATED` or `PENDING_REVIEW`, the response is `status: "ok"` with every other field `null`. The caregiver card keeps showing "Todo va bien": the response does not even reveal that an alert exists.
- Once it is `REVIEWED` or `FOLLOW_UP_ESTABLISHED`, the response is `status: "reviewed"` with:
  - `concern`: only the general direction, `below` (underweight, stunting, wasting) or `above` (overweight, obesity) the expected growth for the age. No numbers.
  - `recommendation`: the `details` of the follow-up of type `recommendation` linked to the alert, written by the professional for the family. `null` if there is none.
  - `nextCheckupDate`: the latest `nextCheckupDate` among the follow-ups of that alert.
  - `reviewedAt`: when the alert reached its current state.
- The response never contains z-scores, percentiles, classifications, the indicator, the risk type or the severity. This also holds for the rest of the caregiver API: `checkups` return no results for caregivers, and the alert endpoints (`/alerts`) require the `alert:review` permission, which caregivers do not have.

### Automated favorable growth trend (NK-74)

In parallel with the professional-reviewed growth message, the Evolution screen displays an automated "Tendencia favorable" label next to the chart (`GET /children/:childId/growth-trend`) when the latest current checkup is normal and `|z_latest| <= |z_previous| + 0.5`. Unlike the growth message, this endpoint never sends negative or cautionary labels to the caregiver (those remain strictly the responsibility of the health professional via the reviewed growth message). **Clinical note:** This automated trend rule is conservative and requires validation by the clinical health team prior to release.

## In the app

The Home card of each child (`ChildGrowthStatus`) loads the message with `useGrowthMessage`. Before the review, while loading and on any error it shows "Todo va bien" (a failure never produces a clinical message). After the review it shows "Revisado por tu profesional", the orientation text for `below` or `above`, the recommendation and the next checkup date. Texts are in `caregiver:home.growth.*` (Spanish and Kichwa; the Kichwa copy of the Spanish text until a reviewed translation exists).

## Limits

- `follow_ups` has no timestamp, so when an alert has several recommendations the first one found is shown, and the next checkup date is the latest one.
- The text of the recommendation is free text written by the professional: it is shown as written. Nothing prevents a professional from typing technical terms in it.
- If a professional reviews an alert but records no follow-up, the caregiver sees the generic "Tu profesional revisó los últimos controles…" without a date.
