<script lang="ts" setup>
import { useTitle } from '@vueuse/core'
import NcLayout from '~icons/nc-icons/layout'

const props = defineProps<{
  baseId?: string
}>()

const basesStore = useBases()

const { openedProject, activeProjectId, basesUser, bases } = storeToRefs(basesStore)
const { activeTables, activeTable } = storeToRefs(useTablesStore())
const { activeWorkspace } = storeToRefs(useWorkspace())

const { navigateToProjectPage } = useBase()

const isAdminPanel = inject(IsAdminPanelInj, ref(false))

const router = useRouter()
const route = router.currentRoute

const { $e, $api } = useNuxtApp()

const currentBase = computedAsync(async () => {
  let base
  if (props.baseId) {
    base = bases.value.get(props.baseId)
    if (!base) base = await $api.base.read(props.baseId!)
  } else {
    base = openedProject.value
  }

  return base
})

const { isUIAllowed, baseRoles } = useRoles()

const { projectPageTab } = storeToRefs(useConfigStore())

const { isMobileMode } = useGlobal()

const userCount = computed(() =>
  activeProjectId.value ? basesUser.value.get(activeProjectId.value)?.filter((user) => !user?.deleted)?.length : 0,
)

watch(
  () => route.value.query?.page,
  (newVal, oldVal) => {
    // if (route.value.name !== 'index-typeOrId-baseId-index-index') return
    if (newVal && newVal !== oldVal) {
      if (newVal === 'collaborator') {
        projectPageTab.value = 'collaborator'
      } else if (newVal === 'data-source') {
        projectPageTab.value = 'data-source'
      } else {
        projectPageTab.value = 'allTable'
      }
      return
    }

    if (isAdminPanel.value) {
      projectPageTab.value = 'collaborator'
    } else {
      projectPageTab.value = 'allTable'
    }
  },
  { immediate: true },
)

watch(projectPageTab, () => {
  $e(`a:project:view:tab-change:${projectPageTab.value}`)

  if (projectPageTab.value) {
    navigateToProjectPage({
      page: projectPageTab.value as any,
    })
  }
})

watch(
  () => [currentBase.value?.id, currentBase.value?.title],
  () => {
    if (activeTable.value?.title) return

    useTitle(`${currentBase.value?.title ?? activeWorkspace.value?.title ?? 'NocoDB'}`)
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <div class="h-full nc-base-view">
    <div
      v-if="!isAdminPanel"
      class="flex flex-row pl-2 pr-2 gap-1 border-b-1 border-gray-200 justify-between w-full"
      :class="{ 'nc-table-toolbar-mobile': isMobileMode, 'h-[var(--topbar-height)]': !isMobileMode }"
    >
      <div class="flex flex-row items-center gap-x-3">
        <GeneralOpenLeftSidebarBtn />
        <div class="flex flex-row items-center h-full gap-x-2.5">
          <GeneralProjectIcon :color="parseProp(currentBase?.meta).iconColor" :type="currentBase?.type" />
          <NcTooltip class="flex font-medium text-sm capitalize truncate max-w-150" show-on-truncate-only>
            <template #title> {{ currentBase?.title }}</template>
            <span class="truncate">
              {{ currentBase?.title }}
            </span>
          </NcTooltip>
        </div>
      </div>
      <LazyGeneralShareProject />
    </div>
    <div
      class="flex mx-12 my-8 nc-base-view-tab"
      :style="{
        height: 'calc(100% - var(--topbar-height))',
      }"
    >
      <a-tabs v-model:activeKey="projectPageTab" class="w-full">
        <a-tab-pane v-if="!isAdminPanel" key="allTable">
          <template #tab>
            <div class="tab-title" data-testid="proj-view-tab__all-tables">
              <NcLayout />
              <div>{{ $t('labels.allTables') }}</div>
              <div
                class="tab-info"
                :class="{
                  'bg-primary-selected': projectPageTab === 'allTable',
                  'bg-gray-50': projectPageTab !== 'allTable',
                }"
              >
                {{ activeTables.length }}
              </div>
            </div>
          </template>
          <ProjectAllTables />
        </a-tab-pane>
        <!-- <a-tab-pane v-if="defaultBase" key="erd" tab="Base ERD" force-render class="pt-4 pb-12">
          <ErdView :source-id="defaultBase!.id" class="!h-full" />
        </a-tab-pane> -->
        <a-tab-pane v-if="isUIAllowed('newUser', { roles: baseRoles })" key="collaborator">
          <template #tab>
            <div class="tab-title" data-testid="proj-view-tab__access-settings">
              <GeneralIcon icon="users" class="!h-3.5 !w-3.5" />
              <div>{{ $t('labels.members') }}</div>
              <div
                v-if="userCount"
                class="tab-info"
                :class="{
                  'bg-primary-selected': projectPageTab === 'collaborator',
                  'bg-gray-50': projectPageTab !== 'collaborator',
                }"
              >
                {{ userCount }}
              </div>
            </div>
          </template>
          <ProjectAccessSettings :base-id="currentBase?.id" />
        </a-tab-pane>
        <!--        <a-tab-pane v-if="isUIAllowed('sourceCreate')" key="data-source">
          <template #tab>
            <div class="tab-title" data-testid="proj-view-tab__data-sources">
              <GeneralIcon icon="database" />
              <div>{{ $t('labels.dataSources') }}</div>
              <div
                v-if="base.sources?.length"
                class="tab-info"
                :class="{
                  'bg-primary-selected': projectPageTab === 'data-source',
                  'bg-gray-50': projectPageTab !== 'data-source',
                }"
              >
                {{ base.sources.length }}
              </div>
            </div>
          </template>
          <DashboardSettingsDataSources v-model:state="baseSettingsState" />
        </a-tab-pane> -->
      </a-tabs>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:deep(.ant-tabs-content) {
  @apply !h-full;
}
:deep(.ant-tabs-nav) {
  @apply !mb-0;
}

.tab-title {
  @apply flex flex-row items-center gap-x-2 px-2;
}
:deep(.ant-tabs-tab .tab-title) {
  @apply text-gray-500;
}
:deep(.ant-tabs-tab-active .tab-title) {
  @apply text-primary;
}

.tab-info {
  @apply flex pl-1.25 px-1.5 py-0.75 rounded-md text-xs;
}
</style>
