<script lang="ts">
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
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
	<!-- First, so a viewer who can't read the current language finds theirs (SPEC-i18n.md). -->
	<LanguageSwitcher />
	<h1 class={css({ textStyle: "h1", marginBlockStart: "section", textWrap: "balance" })}>
		{m.placeholder_title({ name: "Zimuarr" })}
	</h1>
	<p class={css({ marginBlockStart: "lg", color: "muted", textWrap: "pretty" })}>
		{m.placeholder_status()}
	</p>
</main>
