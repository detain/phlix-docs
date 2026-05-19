import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: h(DefaultTheme.Layout),
  enhanceApp({ app, router, siteData }) {
  }
} satisfies Theme
