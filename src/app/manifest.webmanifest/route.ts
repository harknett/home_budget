/**
 * The manifest that lets the budget be added to a phone's home screen.
 * `display: standalone` drops the browser chrome, which is most of what makes
 * it feel like an app.
 */
export function GET(): Response {
  return Response.json({
    name: "Home Budget",
    short_name: "Budget",
    description: "Envelope budgeting for a household.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  });
}
