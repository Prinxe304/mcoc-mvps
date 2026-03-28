import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

const missing = [
  !clerkPublishableKey ? "VITE_CLERK_PUBLISHABLE_KEY" : null,
  !convexUrl ? "VITE_CONVEX_URL" : null,
].filter(Boolean) as string[];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {missing.length > 0 ? (
      <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
        <h2>Missing environment variables</h2>
        <p>Please add these in <code>.env.local</code> and restart <code>npm run dev</code>:</p>
        <pre>{missing.join("\n")}</pre>
      </div>
    ) : (
      <ClerkProvider publishableKey={clerkPublishableKey!}>
        <ConvexProviderWithClerk client={new ConvexReactClient(convexUrl!)} useAuth={useAuth}>
          <App />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    )}
  </StrictMode>,
)
