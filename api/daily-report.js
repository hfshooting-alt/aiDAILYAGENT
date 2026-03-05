import { waitUntil } from '@vercel/functions';
import { runDailyBriefing } from '../src/runDailyBriefing.js';

function isSyncMode(req) {
  const raw = req.query?.sync;
  if (Array.isArray(raw)) {
    return raw.includes('1') || raw.includes('true');
  }
  return raw === '1' || raw === 'true';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const syncMode = isSyncMode(req);

  if (syncMode) {
    try {
      const result = await runDailyBriefing();
      res.status(200).json({ ok: true, mode: 'sync', result });
    } catch (error) {
      res.status(500).json({ ok: false, mode: 'sync', error: error.message });
    }
    return;
  }

  waitUntil(
    runDailyBriefing()
      .then((result) => {
        console.log('Async daily briefing finished successfully.', result);
      })
      .catch((error) => {
        console.error('Async daily briefing failed.', error);
      })
  );

  res.status(202).json({
    ok: true,
    mode: 'async',
    message: 'Accepted. Daily briefing is running in background. Check Vercel Logs for result.'
  });
}
