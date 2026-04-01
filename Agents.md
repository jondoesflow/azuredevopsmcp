# Project Instructions

## Testing Policy

Any new code introduced must include accompanying unit tests. 
If tests are not feasible, explain why and get explicit approval before proceeding without tests.

## Documentation update policy

update any relevant documentation except "Agents.md" automatically whenever we make changes in code. this can be "code-docs.md" or another relevant file.


## Commit policy

Suggest an appropriate commit message using the following "conventional commit" structure after every change following a successful playtest:

```
<type>[optional scope]: [description]

[optional body]

[optional footer(s)]
```

Where...

Type : type of Commit 
Scope: (optional) what part of the codebase your change affects
description: concise description of change
body (optional): explain why change was made and provide any additional context that isnt obvious from the short one line header
footer: metadata such as declaring a breaking change or work item number

An exhaustive list of commit types:
* feat — Features: A new feature
* fix — Bug Fixes: A bug fix
* docs — Documentation: Documentation‑only changes
* style — Styles: Changes that do not affect the meaning of the code (white‑space, formatting, missing semicolons, etc.)
* refactor — Code Refactoring: A code change that neither fixes a bug nor adds a feature
* perf — Performance Improvements: A code change that improves performance
* test — Tests: Adding missing tests or correcting existing tests
* build — Builds: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
* ci — Continuous Integrations: Changes to CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
* chore — Chores: Other changes that don’t modify src or test files
* revert — Reverts: Reverts a previous commit

Note: the agent does not have jurisdiction to actually do the commits themselves, the developer still does that. they only *suggest* commit messages regarding changes