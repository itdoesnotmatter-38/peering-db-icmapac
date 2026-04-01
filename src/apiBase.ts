const rawApiRoot = process.env.REACT_APP_API_ROOT || "";

export const API_ROOT = rawApiRoot.replace(/\/$/, "");

export const withApiRoot = (path: string) => {
  if (!API_ROOT) return path;
  return `${API_ROOT}${path}`;
};
