// Extiende app.json. En EAS Build, GOOGLE_SERVICES_JSON es una variable de
// entorno de tipo archivo (google-services.json no se sube al repo).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
