import { seedLmsReferences } from '../src/lib/seedLms.js';

async function main() {
  try {
    await seedLmsReferences();
  } catch (error) {
    console.error('❌ Error durante la ejecución del seed LMS:', error);
    process.exit(1);
  }
}

void main();
