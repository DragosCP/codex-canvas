import { connectionVerb } from "../runtime";
import type { ConnectionStatus } from "../types";

export function ConnectionBadge(props: {
  status: ConnectionStatus;
  error: string | null;
  backendLabel: string;
}) {
  return (
    <div
      className={`connection-badge ${props.status}`}
      title={props.error ?? props.backendLabel}
    >
      <span />
      {connectionVerb(props.status)}
    </div>
  );
}
