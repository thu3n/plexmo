export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Prevent interval from being registered multiple times in dev mode
        if ((global as any).__cron_interval) {
            return;
        }

        const { runCronJob } = await import('@/lib/cron');

        console.log('[Instrumentation] 🚀 Background sync service starting...');

        // Run immediately on start
        try {
            console.log('[Instrumentation] Initial sync trigger...');
            runCronJob().catch(err => console.error('[Instrumentation] Initial sync failed:', err));
        } catch (e) {
            console.error('[Instrumentation] Initial sync error:', e);
        }

        const intervalId = setInterval(async () => {
            // console.log('[Instrumentation] Running background sync...');
            try {
                await runCronJob();
            } catch (e) {
                console.error('[Instrumentation] Sync failed', e);
            }
        }, 30000); // 30 seconds

        (global as any).__cron_interval = intervalId;
        console.log('[Instrumentation] ✅ Background sync interval registered (30s)');
    }
}
