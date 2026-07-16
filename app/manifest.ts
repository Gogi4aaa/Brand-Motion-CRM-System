import type { MetadataRoute } from "next";

// Web app manifest: прави системата инсталируема на телефона („Добави към
// начален екран“). На iPhone това е ЗАДЪЛЖИТЕЛНО за push нотификациите —
// Safari праща push само на инсталирани (standalone) web app-ове.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BrandMotion CRM",
    short_name: "BrandMotion",
    description: "Работното пространство на агенцията — клиенти, продукция, задачи.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0090B5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
