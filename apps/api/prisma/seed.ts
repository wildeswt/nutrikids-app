import { seedLmsReferences } from '../src/lib/seedLms.js';
import { assertNotProduction, seedDevData } from '../src/lib/seedDev.js';

async function main() {
  try {
    assertNotProduction();
    await seedLmsReferences();
    await seedDevData();
  } catch (error) {
    console.error('❌ Error durante la ejecución del seed:', error);
    process.exit(1);
  }
}

void main();
