import {
  Bot,
  Server,
  Blocks,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import type { ReactNode } from "react";

export type StepStatus = "pending" | "active" | "success" | "error";

interface DataField {
  label: string;
  value: string;
  mono?: boolean;
}

export interface StepCardProps {
  stepNumber: number;
  title: string;
  sender: "agent" | "gateway" | "blockchain";
  receiver: "agent" | "gateway" | "blockchain";
  status: StepStatus;
  accentColor: string;
  data?: DataField[];
  children?: ReactNode;
}

const ACTOR_CONFIG = {
  agent: { icon: Bot, label: "Agent" },
  gateway: { icon: Server, label: "Gateway" },
  blockchain: { icon: Blocks, label: "Blockchain" },
} as const;

function StatusIndicator({ status }: { status: StepStatus }) {
  switch (status) {
    case "active":
      return <Loader2 className="w-5 h-5 text-flare-coral animate-spin" />;
    case "success":
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case "error":
      return <XCircle className="w-5 h-5 text-red-400" />;
    default:
      return null;
  }
}

export function StepCard({
  stepNumber,
  title,
  sender,
  receiver,
  status,
  accentColor,
  data,
  children,
}: StepCardProps) {
  if (status === "pending") return null;

  const SenderIcon = ACTOR_CONFIG[sender].icon;
  const ReceiverIcon = ACTOR_CONFIG[receiver].icon;

  return (
    <div
      className="animate-slideIn bg-flare-card border border-flare-border rounded-xl overflow-hidden"
      style={{ borderLeftWidth: "4px", borderLeftColor: accentColor }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-flare-coral/20 text-flare-coral">
              Step {stepNumber}
            </span>
            <h3 className="text-white font-semibold">{title}</h3>
          </div>
          <StatusIndicator status={status} />
        </div>

        {/* Flow arrow: Sender -> Receiver */}
        <div className="flex items-center gap-3 mb-4 text-sm text-gray-400">
          <div className="flex items-center gap-1.5">
            <SenderIcon className="w-4 h-4" />
            <span>{ACTOR_CONFIG[sender].label}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-600" />
          <div className="flex items-center gap-1.5">
            <ReceiverIcon className="w-4 h-4" />
            <span>{ACTOR_CONFIG[receiver].label}</span>
          </div>
        </div>

        {/* Data fields */}
        {data && data.length > 0 && (
          <div className="space-y-2 bg-flare-dark/50 rounded-lg p-3">
            {data.map((field) => (
              <div key={field.label} className="flex justify-between gap-4 text-sm">
                <span className="text-gray-500 shrink-0">{field.label}</span>
                <span
                  className={`text-gray-200 text-right truncate ${
                    field.mono ? "font-mono text-xs" : ""
                  }`}
                >
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
