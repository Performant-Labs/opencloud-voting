import {
  defineWebApplication,
  ApplicationSetupOptions,
  Extension,
  AppMenuItemExtension
} from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import { RouteRecordRaw } from 'vue-router'
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'

export default defineWebApplication({
  setup(args) {
    const { $gettext } = useGettext()

    const appInfo = {
      id: 'feature-voting',
      name: $gettext('Feature Voting'),
      icon: 'lightbulb-flash-line',
      color: '#6366f1'
    }

    const routes: RouteRecordRaw[] = [
      {
        path: '/',
        redirect: `/${appInfo.id}/board`
      },
      {
        path: '/board',
        name: 'voting-board',
        component: () => import('./App.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Feature Voting')
        }
      }
    ]

    const extensions = ({ applicationConfig }: ApplicationSetupOptions) => {
      return computed<Extension[]>(() => {
        const menuItems: AppMenuItemExtension[] = [
          {
            id: `app.${appInfo.id}.menuItem`,
            type: 'appMenuItem',
            label: () => appInfo.name,
            color: appInfo.color,
            icon: appInfo.icon,
            path: urlJoin(appInfo.id)
          }
        ]
        return [...menuItems]
      })
    }

    return {
      appInfo,
      routes,
      extensions: extensions(args)
    }
  }
})
