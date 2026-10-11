import { TesterForm } from "./TesterForm";

export const metadata = { title: "Volunteer to test Colophon" };

export default function Testers() {
  return (
    <div className="wrap page-top" style={{ paddingBottom: 60, maxWidth: 760 }}>
      <div className="sec-head">
        <span className="label">Testers</span>
        <h1 className="display" style={{ fontSize: "clamp(2rem,5vw,3.4rem)" }}>Break it, then tell us.</h1>
        <p className="lede">
          Judges and holders can volunteer. You are named in the users log only if you consent. Colophon stores nothing from this form: it prepares a
          public issue you review before sending.
        </p>
      </div>
      <TesterForm />
    </div>
  );
}
