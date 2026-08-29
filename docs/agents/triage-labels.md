# Triage Labels

The skills use five triage roles. This file maps each role to the label string
in the issue tracker of this repository.

An AFK agent is an agent that does work when no person is present.

| Label in mattpocock/skills | Label in this tracker | Meaning                                        |
| -------------------------- | --------------------- | ---------------------------------------------- |
| `needs-triage`             | `needs-triage`        | The maintainer must evaluate this issue.       |
| `needs-info`               | `needs-info`          | The issue waits for data from the reporter.    |
| `ready-for-agent`          | `ready-for-agent`     | The issue is complete. An AFK agent can start. |
| `ready-for-human`          | `ready-for-human`     | A person must do this work.                    |
| `wontfix`                  | `wontfix`             | No person and no agent will do this work.      |

A skill can name a role. An example is "apply the AFK-ready triage label". Use
the label string from the second column of this table.

If you use different label strings, change the second column.
