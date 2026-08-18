export default function StatusStamp({ status }) {
  const label = String(status || "").replace(/_/g, " ");
  const cls = `stamp stamp-${status}`;
  return <span className={cls}>{label}</span>;
}
