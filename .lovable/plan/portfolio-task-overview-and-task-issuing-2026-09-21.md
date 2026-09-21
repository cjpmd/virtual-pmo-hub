# Portfolio Task Overview and Task Issuing

## Outcome
Build a portfolio-wide task control centre, personal work views for Chris McDonald, and a mock task issuing workflow that works consistently from Projects, project detail, Task Overview, and the command palette.

## Data and calculations
- Extend the typed task model with estimated effort, baseline finish, checklist items, and enough realistic tasks for every portfolio project.
- Add typed issued-task records and workflow states: Issued, Accepted, Declined, Proposed new date, In progress, and Done.
- Seed issued-task examples covering awaiting acknowledgement, accepted, proposed date, declined, overdue acknowledgement, completed, and Planner-connected sync states.
- Add service functions that resolve each task with its project, programme, task source, calculated standard status, effort completed/remaining, Planner link, and personal due-date group.
- Keep all data mock-only and expose it through the service layer.

## Portfolio Task Overview
- Add a **Task Overview** navigation item and page with filters for programme, project, bucket, assignee, task status, and date range.
- Show the ten requested KPI cards, recalculated from the filtered task set.
- Add four responsive charts: status donut, project/bucket stacked tasks, project effort stacked bars, and overdue tasks by assignee.
- Add the cross-project task register with task, project, bucket, assignee, dates, progress, effort values, standard status, and Planner links where applicable.
- Add a dedicated portfolio Gantt with collapsible project groups, accurately positioned status-coloured task bars, and a today line.

## My Work and My Timeline
- Rebuild **My Work** around Chris McDonald’s tasks with the same KPI set and task register, grouped into Overdue, Today, This week, Next week, and Later.
- Add **Issued to me** cards with Accept, Decline, and Propose date actions, including required reasons or proposed dates where appropriate.
- Add **Issued by me** tracking with acknowledgement state, responses, and Send reminder for overdue acknowledgements.
- Add a separate **My Timeline** page with a personal Gantt using the same date groups and standard task status colours.

## Task issuing workflow
- Build one reusable **Issue task** side panel for single and bulk issuing.
- Include project, title, description, multiple assignees, pasted-name input, due date, estimated effort, priority, checklist, and attachments.
- Create one issued record per assignee and show a confirmation summary.
- For Planner-connected projects, show pending sync followed by a mock “Created in Planner” state when the assignee accepts.
- Expose Issue task from the Projects page, project page, Task Overview, and Ctrl/Cmd+K command palette.
- Share issued-task state across these views for the session and persist it locally for prototype continuity.

## Technical details
- Add focused task analytics, filter, Gantt, issuing, and issued-task tracker components rather than overloading the generic board.
- Reuse the existing semantic colour tokens, standard delivery icons, buttons, sheets, avatar patterns, Recharts, UK dates, and responsive layout conventions.
- Avoid server or authentication changes; this remains a realistic clickable prototype.
- Add unique page metadata to the new routes and complete the required metadata audit across existing content routes.

## Verification
- Check type safety and the running preview.
- Exercise all filters, charts, grouped task table, project collapses, issue-task launch points, bulk/pasted assignees, acknowledgement actions, reminders, Planner sync simulation, personal grouping, and both Gantt views.
- Verify desktop and mobile layouts, dark mode, no page errors, and no unintended horizontal page overflow.
