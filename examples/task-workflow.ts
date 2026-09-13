/**
 * Models a Jira/Trello/Linear-shaped ticket workflow:
 *
 *   todo -> in_progress -> to_review -> approved -> done
 *                              ^  |
 *                              +--+ (rejected back to todo)
 *
 * Entering "to_review" pushes a draft PR — a real async side effect, not
 * just a context update — and folds the PR URL into context before the
 * voice reply goes out. `pushDraftPullRequest` below is a stub so this
 * example runs with no GitHub credentials; swap it for a real GitHub
 * client call (e.g. the one in your MCP server's integrations layer).
 */
import { fsmFromStatusGraph } from "../src/import.js";

export interface TicketContext {
  prUrl?: string;
  prState?: "draft" | "ready" | "merged";
}

async function pushDraftPullRequest(): Promise<{ url: string }> {
  // Stub: replace with a real GitHub API call. Kept async and awaited by
  // the FSM so a real network call would work exactly the same way.
  return { url: "https://github.com/example/repo/pull/123" };
}

export const ticketWorkflow = fsmFromStatusGraph<TicketContext>({
  id: "ticket",
  initial: "todo",
  context: {},
  graph: {
    todo: ["in_progress"],
    in_progress: ["to_review"],
    to_review: ["approved", "todo"],
    approved: ["done"],
    done: [],
  },
  prompts: {
    todo: "In the backlog.",
    in_progress: "In progress.",
    to_review: "In review. A draft pull request is up.",
    approved: "Approved. Ready to finish up.",
    done: "Done.",
  },
  onEnter: {
    to_review: async (_ctx) => {
      const pr = await pushDraftPullRequest();
      return { prUrl: pr.url, prState: "draft" };
    },
  },
});

// Generated tools: ticket_move_to_in_progress, ticket_move_to_to_review,
// ticket_move_to_approved, ticket_move_to_todo (the reject path from
// to_review), ticket_move_to_done.
