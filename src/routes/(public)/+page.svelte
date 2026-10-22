<script lang="ts">
import { css } from "#styled-system/css";
</script>

<svelte:head>
	<title>Zimuarr</title>
</svelte:head>

<!-- Placeholder until the first module gives / a surface (sign-in is the public entry). -->
<main
	class={css({
		maxWidth: "readingMax",
		marginInline: "auto",
		paddingBlock: "hero",
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
	})}
>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>Zimuarr is being rebuilt.</h1>
	<p class={css({ marginBlockStart: "lg", color: "muted", textWrap: "pretty" })}>
		Sign-in, the first Bazarr connection and the operator dashboard are on their way back. No
		translations run yet.
	</p>
</main>
