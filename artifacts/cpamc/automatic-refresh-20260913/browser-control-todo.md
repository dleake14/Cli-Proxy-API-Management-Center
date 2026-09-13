# Browser Control session restoration observation

Version: 0.3.2. A retained session from the earlier timeline proof no longer had its original session-owned page.

Exact warning: The session default page was closed; created a new page. References to the old page in state are stale.

Reproduction: resume the retained session and navigate to the local automatic-refresh fixture. Expected: retained page or explicit restoration. Actual: a new page was created with the warning above. Recovery: clear prior error state, navigate the new page explicitly, and run all assertions on it. The requested browser checks passed. No credentials or old element references were used. No further action is required for this quota change.
