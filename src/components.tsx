import { ArrowUpRight, Link } from "lucide-react";
import type { VerifiedFact } from "../shared/schema";
type OpenSource = { onOpen: (fact: VerifiedFact) => void };
export function SourceButton({
  fact,
  onOpen,
}: { fact: VerifiedFact } & OpenSource) {
  return (
    <button className="source-button" onClick={() => onOpen(fact)}>
      <Link size={12} />
      {fact.verified ? "View source" : "Unverified — check the original"}
      <ArrowUpRight size={12} />
    </button>
  );
}
export function FactList({
  items,
  empty,
  onOpen,
}: { items: VerifiedFact[]; empty: string } & OpenSource) {
  return (
    <>
      {items.length ? (
        items.map((f, i) => (
          <div className={"fact " + (!f.verified ? "unverified" : "")} key={i}>
            <p>{f.text}</p>
            {f.detail && <small>{f.detail}</small>}
            <SourceButton fact={f} onOpen={onOpen} />
          </div>
        ))
      ) : (
        <p className="empty-note">{empty}</p>
      )}
    </>
  );
}
