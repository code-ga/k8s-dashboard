# Note
## Redesign
- [ ] Agent need to create the node infomation and update them in time running the server just show and decided which node use for port forward
- [x] Service sync by each heartbeat in k8s cluster
- [x] Update frontend/src/routes/dashboard/cluster/$id/nodes.tsx (Display join token command)
- [x] show node role in k8s cluster
- [ ] batch lazy command (sending batch message to agent and save to db the stage of command (pending, sent, success, failed) )