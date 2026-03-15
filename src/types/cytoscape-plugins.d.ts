declare module "cytoscape-cose-bilkent" {
  import type cytoscape from "cytoscape";
  const register: (cy: typeof cytoscape) => void;
  export default register;
}

declare module "cytoscape-dagre" {
  import type cytoscape from "cytoscape";
  const register: (cy: typeof cytoscape) => void;
  export default register;
}
