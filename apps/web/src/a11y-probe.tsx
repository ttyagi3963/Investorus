// Deliberate accessibility violation to prove CI's lint job fails. Revert this commit.
export function Probe() {
  return <img src="/x.png" />;
}
