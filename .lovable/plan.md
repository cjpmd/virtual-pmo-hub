# Restore the Dependency Map and add Workshop mode

## What you will get
- A visible **Register / Map** choice in Dependencies, alongside the existing dependency sync. The Map will remain a shareable page and retain its current programme, project and milestone levels, health-coloured arrows, filters, zoom and chain focus.
- A **Workshop mode** switch on the Map, inspired by the Benefits Map: a clearer discussion canvas with movable nodes and a direct way to draw a dependency from a giving node to a receiving node.
- Selecting a connection will open a short editor for the dependency description, type, owners, required-by date and criticality. Existing connections can be opened and edited from the map. Save, close and delete actions will be available where appropriate, with confirmation for destructive changes.
- Workshop edits will **update the dependency register immediately** and remain after refresh in this browser. The Map, register, project/programme dependency views and counts will use the same updated records. No real Microsoft sync or shared database will be added.

## Technical approach
- Expose the existing `/delivery/dependencies/map` page in Delivery navigation and add clear Register / Map controls at the top of the Dependencies pages.
- Make one browser-local dependency data source for seed records plus changes, rather than keeping edits only in the generic register's display rows. Reconcile existing register edits with it so both screens display the same valid dependency records; preserve existing sample records and URL focus links.
- Extend the existing graph canvas with Workshop mode, accessible linking/editing controls and local node placement. Validate that links have distinct, valid giving and receiving ends; save a new link as a real dependency with its own reference and initial proposed validation state. Keep the current analytical map unchanged when Workshop mode is off.
- Verify navigation, create/edit/close/delete, refresh persistence, map-to-register consistency and desktop/mobile presentation.
