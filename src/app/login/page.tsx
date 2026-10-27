import { SignInCard } from "./sign-in-card";

export const metadata = { title: "Staff sign in", robots: { index: false } };

export default function LoginPage() {
  return <SignInCard title="Staff sign in" description="For OM ENTERPRISE team members only." allowPin />;
}
