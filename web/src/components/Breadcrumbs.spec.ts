import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Breadcrumbs from './Breadcrumbs.vue'

describe('Breadcrumbs.vue', () => {
  it('renders correctly with multiple items', () => {
    const items = [
      { label: 'Home', to: '/' },
      { label: 'Feature Voting', to: '/feature-voting/board' },
      { label: 'Suggest a Feature' }
    ]

    const wrapper = mount(Breadcrumbs, {
      props: { items },
      global: {
        stubs: {
          RouterLink: {
            template: '<a :href="$attrs.to"><slot /></a>',
          }
        }
      }
    })

    const listItems = wrapper.findAll('li')
    expect(listItems.length).toBe(3)

    // Check first item
    expect(listItems[0].text()).toContain('Home')
    expect(listItems[0].find('a').exists()).toBe(true)

    // Check second item
    expect(listItems[1].text()).toContain('Feature Voting')
    expect(listItems[1].find('a').exists()).toBe(true)

    // Check last item (no link)
    expect(listItems[2].text()).toContain('Suggest a Feature')
    expect(listItems[2].find('span.fv-breadcrumb-current').exists()).toBe(true)
    expect(listItems[2].find('a').exists()).toBe(false)
  })

  it('renders correct number of SVG separators', () => {
    const items = [
      { label: 'Home', to: '/' },
      { label: 'Feature Voting', to: '/feature-voting/board' },
      { label: 'Suggest a Feature' }
    ]

    const wrapper = mount(Breadcrumbs, {
      props: { items },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          }
        }
      }
    })

    const separators = wrapper.findAll('svg.fv-breadcrumb-separator')
    // For 3 items where the first 2 have links, there should be 2 separators.
    expect(separators.length).toBe(2)
  })
})
