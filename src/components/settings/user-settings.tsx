import { CheckCircle2 } from "lucide-react";
import type { PermissionKey } from "@/data/settings-types";
import { updateSettings, useSettings } from "@/services/settings";
import { SelectField, SettingsCard } from "@/components/settings/settings-shell";

const permissionLabels: Record<PermissionKey, string> = {
  viewPortfolio: "View portfolio",
  editProjects: "Edit projects",
  approveGates: "Approve gates",
  manageBenefits: "Manage benefits",
  manageSettings: "Manage settings",
  issueTasks: "Issue tasks",
  validateMeasurements: "Validate measurements",
  recordDecisions: "Record decisions",
};
const homeOptions = [
  { value: "/home/my-work", label: "Home › My Work" },
  { value: "/home/approvals", label: "Home › Approvals" },
  { value: "/portfolio", label: "Portfolio › Overview" },
  { value: "/delivery/tasks", label: "Delivery › Tasks" },
  { value: "/benefits", label: "Benefits › Value dashboard" },
  { value: "/insights/dashboards", label: "Insights › Dashboards" },
  { value: "/settings/organisation", label: "Settings › Organisation" },
];

export function UserSettings() {
  const settings = useSettings();
  return (
    <>
      <SettingsCard
        title="Roles and default home page"
        description="Each role lands on its own home page after signing in."
      >
        <div className="space-y-3">
          {settings.roles.map((role) => (
            <div
              key={role.role}
              className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_260px] sm:items-center"
            >
              <div>
                <p className="text-sm font-semibold">{role.role}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
              </div>
              <SelectField
                label="Default home page"
                value={role.defaultHome}
                onChange={(value) =>
                  updateSettings({
                    roles: settings.roles.map((item) =>
                      item.role === role.role ? { ...item, defaultHome: value } : item,
                    ),
                  })
                }
                options={homeOptions}
              />
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        requires="self"
        title="Permissions matrix"
        description="What each role can do. The database enforces these for every request, so they are fixed per role."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-table-head text-xs text-muted-foreground">
              <tr>
                <th className="h-10 px-3 font-semibold">Role</th>
                {(Object.keys(permissionLabels) as PermissionKey[]).map((key) => (
                  <th key={key} className="px-2 text-center font-semibold">
                    {permissionLabels[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.roles.map((role) => (
                <tr key={role.role} className="border-t">
                  <td className="px-3 py-2.5 font-medium">{role.role}</td>
                  {(Object.keys(permissionLabels) as PermissionKey[]).map((key) => (
                    <td key={key} className="px-2 text-center">
                      {role.permissions[key] ? (
                        <CheckCircle2
                          aria-label={`${role.role} can ${permissionLabels[key]}`}
                          className="mx-auto size-4 text-health-good-foreground"
                        />
                      ) : (
                        <span
                          aria-label={`${role.role} cannot ${permissionLabels[key]}`}
                          className="text-muted-foreground"
                        >
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>
    </>
  );
}
