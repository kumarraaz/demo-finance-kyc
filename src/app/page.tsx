import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Demo Finance KYC</h1>
      <p>
        This is a prototype. Every verification step is <strong>simulated</strong>. It does not perform real KYC,
        does not accept PAN or Aadhaar data, and never approves or offers a loan.
      </p>
      <p>
        <Link href="/admin">Admin dashboard</Link> (login required)
      </p>
    </>
  );
}
