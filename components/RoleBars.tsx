import { CardNameHover } from "@/components/CardNameHover";
import { ROLE_DEFINITIONS } from "@/engine/cards/roleDefinitions";
import type { RoleBreakdown } from "@/lib/contracts";
import { getStatusMeta } from "@/lib/ui/statusStyles";
import type { RoleCounts } from "@/lib/types";

type RoleBarsProps = {
  roles: RoleCounts;
  roleBreakdown?: RoleBreakdown;
};

type RoleConfig = {
  key: keyof RoleCounts;
  label: string;
  min: number;
  max: number;
  cap: number;
  definition: string;
};

const ROLE_CONFIG: RoleConfig[] = [
  {
    key: "ramp",
    label: ROLE_DEFINITIONS.ramp.label,
    min: 8,
    max: 12,
    cap: 16,
    definition: ROLE_DEFINITIONS.ramp.description
  },
  {
    key: "draw",
    label: ROLE_DEFINITIONS.draw.label,
    min: 8,
    max: 12,
    cap: 16,
    definition: ROLE_DEFINITIONS.draw.description
  },
  {
    key: "removal",
    label: ROLE_DEFINITIONS.removal.label,
    min: 6,
    max: 10,
    cap: 16,
    definition: ROLE_DEFINITIONS.removal.description
  },
  {
    key: "wipes",
    label: ROLE_DEFINITIONS.wipes.label,
    min: 2,
    max: 4,
    cap: 8,
    definition: ROLE_DEFINITIONS.wipes.description
  },
  {
    key: "tutors",
    label: ROLE_DEFINITIONS.tutors.label,
    min: 2,
    max: 6,
    cap: 12,
    definition: ROLE_DEFINITIONS.tutors.description
  },
  {
    key: "protection",
    label: ROLE_DEFINITIONS.protection.label,
    min: 3,
    max: 7,
    cap: 12,
    definition: ROLE_DEFINITIONS.protection.description
  },
  {
    key: "finishers",
    label: ROLE_DEFINITIONS.finishers.label,
    min: 2,
    max: 6,
    cap: 12,
    definition: ROLE_DEFINITIONS.finishers.description
  }
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

export function RoleBars({ roles, roleBreakdown }: RoleBarsProps) {
  return (
    <div className="role-bars">
      {ROLE_CONFIG.map((config) => {
        const value = roles[config.key] ?? 0;
        const taggedCards = roleBreakdown?.[config.key] ?? [];
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
            <p className="role-bar-copy muted">{config.definition}</p>
            <p className="role-bar-copy">Recommended {config.min}-{config.max}</p>
            {taggedCards.length > 0 ? (
              <details className="role-tagged-cards">
                <summary>Tagged cards ({taggedCards.length})</summary>
                <ul>
                  {taggedCards.map((card) => (
                    <li key={`${config.key}-${card.name}`}>
                      {card.qty} <CardNameHover name={card.name} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="role-tagged-empty muted">No cards tagged in this category.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
