# SonarQube Remediation Workflow (Mandatory)

Use this workflow every time SonarQube issues are triaged or fixed for this repository.

## Objective

Ensure every SonarQube fix is traceable, reviewed by a human, and merged safely through pull requests.

## Required Process

1. **Run SonarQube and gather evidence**
   - Capture each issue's:
     - Severity
     - Rule key
     - Message
     - File path and line reference
     - Risk/impact summary

2. **Create a GitHub issue first**
   - Open one issue per remediation batch (or per issue, if requested).
   - Include detailed evidence from step 1.
   - Add a clear remediation scope and acceptance criteria.

3. **Create a development branch for the issue**
   - Branch naming convention:
     - `sonar/<issue-number>-<short-summary>`
   - Example:
     - `sonar/42-fix-cognitive-complexity-workitems`

4. **Implement fixes on that branch only**
   - Keep fixes targeted to Sonar findings.
   - Preserve behavior unless a behavior change is explicitly required.
   - Run build/tests/lint checks locally.

5. **Open a pull request to `dev`**
   - PR must reference the GitHub issue.
   - PR description must include:
     - Fixed Sonar rules and file refs
     - Validation performed
     - Any risk/regression notes

6. **Human code review is mandatory**
   - Do not bypass review.
   - Merge only after human approval.

## Minimum Issue Template

Use this structure when creating the GitHub issue:

- **Title**: `SonarQube remediation: <summary>`
- **Project**: `jondoesflow_azuredevopsmcp`
- **Evidence**:
  - `<SEVERITY> | <RULE> | <file>#Lx-Ly | <message>`
- **Impact**: `<why this matters>`
- **Proposed fix**: `<high-level approach>`
- **Validation**:
  - `npx tsc --noEmit`
  - any additional checks used

## Notes

- This workflow applies whenever SonarQube work is requested.
- If the user asks for a different branching target, follow user instruction and note the deviation in issue/PR.
