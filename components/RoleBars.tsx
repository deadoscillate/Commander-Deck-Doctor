import { getStatusMeta } from "@/lib/ui/statusStyles";
import type { RoleCounts } from "@/lib/types";

type RoleBarsProps = {
  roles: RoleCounts;
};

type RoleConfig = {
  key: keyof RoleCounts;
  label: string;
  min: number;
  max: number;
  cap: number;
};

const ROLE_CONFIG: RoleConfig[] = [
  { key: "ramp", label: "Ramp", min: 8, max: 12, cap: 16 },
  { key: "draw", label: "Card Draw", min: 8, max: 12, cap: 16 },
  { key: "removal", label: "Removal", min: 6, max: 10, cap: 16 },
  { key: "wipes", label: "Board Wipes", min: 2, max: 4, cap: 8 },
  { key: "tutors", label: "Tutors", min: 2, max: 6, cap: 12 },
  { key: "protection", label: "Protection", min: 3, max: 7, cap: 12 },
  { key: "finishers", label: "Finishers", min: 2, max: 6, cap: 12 }
];

function toPercent(value: number, cap: number): number {
  if (cap <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / cap) * 100));
}

function statusFor(value: number, min: number, max: number): "LOW" | "OK" | "HIGH" {
  if (value < min) return "LOW";
  if (value > max) return "HIGH";
  return "OK";
}

export function RoleBars({ roles }: RoleBarsProps) {
  return (
    <div className="role-bars">
      {ROLE_CONFIG.map((config) => {
        const value = roles[config.key] ?? 0;
        const status = statusFor(value, config.min, config.max);
        const statusMeta = getStatusMeta(status);
        const fillPct = toPercent(value, config.cap);
        const rangeStart = toPercent(config.min, config.cap);
        const rangeEnd = toPercent(config.max, config.cap);

        return (
          <div className="role-bar-row" key={config.key}>
            <div className="role-bar-head">
              <strong>{config.label}</strong>
              <span>{value}</span>
              <span className={`status-badge ${statusMeta.className}`}>
                {statusMeta.icon} {statusMeta.label}
              </span>
            </div>
            <div className="role-bar-track">
              <span
                className={`role-bar-fill role-bar-fill-${status.toLowerCase()}`}
                style={{ width: `${fillPct}%` }}
              />
              <span
                className="role-bar-range"
                style={{ left: `${rangeStart}%`, width: `${Math.max(2, rangeEnd - rangeStart)}%` }}
              />
            </div>
            <p className="role-bar-copy">Recommended {config.min}-{config.max}</p>
          </div>
        );
      })}
    </div>
  );
}
