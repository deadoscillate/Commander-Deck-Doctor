export type UiStatus = "LOW" | "MED" | "OK" | "HIGH";

export type StatusMeta = {
  label: UiStatus;
  icon: string;
  className: string;
};

export function getStatusMeta(status: UiStatus): StatusMeta {
  if (status === "LOW") {
    return {
      label: "LOW",
      icon: "\u26A0",
      className: "status-badge-low"
    };
  }

  if (status === "HIGH") {
    return {
      label: "HIGH",
      icon: "\u2139",
      className: "status-badge-high"
    };
  }

  if (status === "MED") {
    return {
      label: "MED",
      icon: "\u25CF",
      className: "status-badge-med"
    };
  }

  return {
    label: "OK",
    icon: "\u2713",
    className: "status-badge-ok"
  };
}
