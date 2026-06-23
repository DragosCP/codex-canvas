export type LaneId = "live" | "A" | "B" | "C";

export interface Lane {
  id: LaneId;
  label: string;
  subtitle: string;
}

export const ALL_LANES: Lane[] = [
  { id: "live", label: "Live", subtitle: "Source of truth" },
  { id: "A", label: "A", subtitle: "Proposal" },
  { id: "B", label: "B", subtitle: "Proposal" },
  { id: "C", label: "C", subtitle: "Proposal" },
];
