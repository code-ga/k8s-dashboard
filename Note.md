# Note
## Redesign
- [ ] Agent need to create the node infomation and update them in time running the server just show and decided which node use for port forward
- [x] Service sync by each heartbeat in k8s cluster
- [x] Update frontend/src/routes/dashboard/cluster/$id/nodes.tsx (Display join token command)
- [x] show node role in k8s cluster
- [ ] batch lazy command (sending batch message to agent and save to db the stage of command (pending, sent, success, failed) )

## Future Implementation
### Deployment Logs Strategy
Currently, we implement the **Single Random Pod** strategy for deployment logs (consistent with default `kubectl logs deployment/foo` behavior).

**Trade-offs Analyzed:**
- **Single Random Pod (Current):**
    - *Pros*: Simple, low bandwidth, sufficient for general health checks.
    - *Cons*: Misses errors specific to a single failing replica.
- **Aggregated Logs (All Pods):**
    - *Pros*: Full visibility of distributed errors.
    - *Cons*: High noise/interleaved logs can be confusing in a simple UI; high backend load to multiplex streams; requires complex UI to filter/color by pod.

**Recommendation:**
If "All Pods" is required in the future, implement it as a dedicated "Log Aggregation" view (separate from simple "Logs" tab) that handles interleaving properly (e.g. prefixing lines with Pod ID) or integrates with a logging stack.