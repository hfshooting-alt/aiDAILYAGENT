import dotenv from 'dotenv';
import { listUsedActors, runDailyBriefing } from './runDailyBriefing.js';

dotenv.config();

async function main() {
  if (process.argv.includes('--list-actors')) {
    const acts = await listUsedActors(200);
    console.table(
      acts.map((act) => ({
        id: act.id,
        name: act.name,
        title: act.title,
        username: act.username
      }))
    );
    return;
  }

  const result = await runDailyBriefing();
  console.log('Daily briefing sent successfully.', result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
