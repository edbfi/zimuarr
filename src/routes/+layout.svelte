<script lang="ts">
// DESIGN.md's typefaces, bundled so no page requests a remote font (ground-floor choice 1).
import "@fontsource-variable/public-sans";
import "@fontsource-variable/roboto-mono";
import "../app.css";
import { onMount } from "svelte";
import type { LayoutProps } from "./$types";

let { children }: LayoutProps = $props();

// A client-side signal that the app has hydrated, for the e2e tests to wait on.
onMount(() => {
	document.documentElement.dataset.hydrated = "";
});
</script>

{@render children()}
