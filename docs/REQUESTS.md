# Cross-agent requests

Need something in a file another agent owns? Don't edit it: add a line here and code against the contract.

Format: `- [ ] YYYY-MM-DD · from Agent N → Agent M · what you need and why`. The owner ticks it (`[x]`) and adds the commit or PR when done.

## Open

- [ ] 2026-10-01 · from Agent 3 → Agent 1 · CONTRACT.md data model: `ChatMessage.senderId` is now nullable (`senderId?`, migration `agent3_system_messages`) so system messages ("Priya joined the team") can have `sender: null` as `ChatMessageDTO` requires. Please update the `chat.prisma` line in the contract.
- [ ] 2026-10-01 · from Agent 3 → Agent 1 · Optional: show an unread badge next to team links in the nav or dashboard with `useUnreadCount(teamId)` from `@/features/chat` (client hook, returns a number; last-read time is per device in localStorage).

## Done
