<script lang="ts" setup>
import type { BaseType, TableType } from 'nocodb-sdk'
import { toRef } from '@vue/reactivity'
import { message } from 'ant-design-vue'
import { storeToRefs } from 'pinia'

import type { SidebarTableNode } from '~/lib/types'

const props = withDefaults(
  defineProps<{
    base: BaseType
    table: SidebarTableNode
    sourceIndex: number
  }>(),
  { sourceIndex: 0 },
)

const base = toRef(props, 'base')
const table = toRef(props, 'table')
const sourceIndex = toRef(props, 'sourceIndex')

const { openTable: _openTable } = useTableNew({
  baseId: base.value.id!,
})

const route = useRoute()

const { isUIAllowed } = useRoles()

const { isMobileMode } = useGlobal()

const tabStore = useTabs()
const { updateTab } = tabStore

const { $e, $api } = useNuxtApp()

useTableNew({
  baseId: base.value.id!,
})

const { meta: metaKey, control } = useMagicKeys()

const { copy } = useCopy()

const baseRole = inject(ProjectRoleInj)
provide(SidebarTableInj, table)

const { setMenuContext, openRenameTableDialog: _openRenameTableDialog, duplicateTable: _duplicateTable } = inject(TreeViewInj)!

const { loadViews: _loadViews } = useViewsStore()
const { activeView, activeViewTitleOrId, viewsByTable } = storeToRefs(useViewsStore())
const { isLeftSidebarOpen } = storeToRefs(useSidebarStore())

// todo: temp
const { baseTables } = storeToRefs(useTablesStore())
const tables = computed(() => baseTables.value.get(base.value.id!) ?? [])

const openedTableId = computed(() => route.params.viewId)

const isTableDeleteDialogVisible = ref(false)

const isOptionsOpen = ref(false)

const setIcon = async (icon: string, table: TableType) => {
  try {
    table.meta = {
      ...((table.meta as object) || {}),
      icon,
    }
    tables.value.splice(tables.value.indexOf(table), 1, { ...table })

    updateTab({ id: table.id }, { meta: table.meta })

    await $api.dbTable.update(table.id as string, {
      meta: table.meta,
    })

    $e('a:table:icon:navdraw', { icon })
  } catch (e) {
    message.error(await extractSdkResponseErrorMsg(e))
  }
}

// Todo: temp

const { isSharedBase } = useBase()
// const isMultiBase = computed(() => base.sources && base.sources.length > 1)

const canUserEditEmote = computed(() => {
  return isUIAllowed('tableIconEdit', { roles: baseRole?.value })
})

const isExpanded = ref(false)
const isLoading = ref(false)

// Tracks if the table ID has been successfully copied to the clipboard
const isTableIdCopied = ref(false)

const onExpand = async () => {
  if (isExpanded.value) {
    isExpanded.value = false
    return
  }

  isLoading.value = true
  try {
    await _loadViews({ tableId: table.value.id, ignoreLoading: true })
  } catch (e) {
    message.error(await extractSdkResponseErrorMsg(e))
  } finally {
    isLoading.value = false
    isExpanded.value = true
  }
}

const onOpenTable = async () => {
  if (isMac() ? metaKey.value : control.value) {
    await _openTable(table.value, true)
    return
  }

  isLoading.value = true
  try {
    await _openTable(table.value)

    if (isMobileMode.value) {
      isLeftSidebarOpen.value = false
    }
  } catch (e) {
    message.error(await extractSdkResponseErrorMsg(e))
  } finally {
    isLoading.value = false
    isExpanded.value = true
  }
}
let tableIdCopiedTimeout: NodeJS.Timeout

const onTableIdCopy = async () => {
  if (tableIdCopiedTimeout) {
    clearTimeout(tableIdCopiedTimeout)
  }

  try {
    await copy(table.value!.id!)
    isTableIdCopied.value = true

    tableIdCopiedTimeout = setTimeout(() => {
      isTableIdCopied.value = false
      clearTimeout(tableIdCopiedTimeout)
    }, 5000)
  } catch (e: any) {
    message.error(e.message)
  }
}

watch(
  () => activeView.value?.id,
  () => {
    if (!activeView.value) return

    if (activeView.value?.fk_model_id === table.value?.id) {
      isExpanded.value = true
    }
  },
  {
    immediate: true,
  },
)

const isTableOpened = computed(() => {
  return openedTableId.value === table.value?.id && (activeView.value?.is_default || !activeViewTitleOrId.value)
})

let tableTimeout: NodeJS.Timeout

watch(openedTableId, () => {
  if (tableTimeout) {
    clearTimeout(tableTimeout)
  }

  if (table.value.id !== openedTableId.value && isExpanded.value) {
    const views = viewsByTable.value.get(table.value.id!)?.filter((v) => !v.is_default) ?? []

    if (views.length) return

    tableTimeout = setTimeout(() => {
      if (isExpanded.value) {
        isExpanded.value = false
      }
      clearTimeout(tableTimeout)
    }, 10000)
  }
})

const duplicateTable = (table: SidebarTableNode) => {
  isOptionsOpen.value = false
  _duplicateTable(table)
}

const openRenameTableDialog = (table: SidebarTableNode, sourceId: string) => {
  isOptionsOpen.value = false
  _openRenameTableDialog(table, !!sourceId)
}

const deleteTable = () => {
  isOptionsOpen.value = false
  isTableDeleteDialogVisible.value = true
}

// TODO: Should find a way to render the components without using the `nextTick` function
const refreshViews = async () => {
  isExpanded.value = false
  await nextTick()
  isExpanded.value = true
}

const source = computed(() => {
  return base.value?.sources?.[sourceIndex.value]
})
</script>

<template>
  <div
    class="nc-tree-item nc-table-node-wrapper text-sm select-none w-full"
    :data-order="table.order"
    :data-id="table.id"
    :data-table-id="table.id"
    :class="[`nc-base-tree-tbl nc-base-tree-tbl-${table.title?.replaceAll(' ', '')}`]"
    :data-active="openedTableId === table.id"
  >
    <div class="flex items-center py-0.5">
      <div
        v-e="['a:table:open']"
        class="flex-none flex-1 table-context flex items-center gap-1 h-full nc-tree-item-inner nc-sidebar-node pr-0.75 mb-0.25 rounded-md h-7 w-full group cursor-pointer hover:bg-gray-200"
        :class="{
          'hover:bg-gray-200': openedTableId !== table.id,
          'pl-13.5': sourceIndex !== 0,
          'pl-7.5 xs:(pl-6)': sourceIndex === 0,
          '!bg-primary-selected': isTableOpened,
        }"
        :data-testid="`nc-tbl-side-node-${table.title}`"
        @contextmenu="setMenuContext('table', table)"
        @click="onOpenTable"
      >
        <div class="flex flex-row h-full items-center">
          <div class="flex w-auto" :data-testid="`tree-view-table-draggable-handle-${table.title}`">
            <GeneralLoader v-if="table.isViewsLoading" class="flex items-center w-6 h-full !text-gray-600" />
            <div
              v-else
              v-e="['c:table:emoji-picker']"
              class="flex items-center nc-table-icon"
              :class="{
                'pointer-events-none': !canUserEditEmote,
              }"
              @click.stop
            >
              <LazyGeneralEmojiPicker
                :key="table.meta?.icon"
                :emoji="table.meta?.icon"
                size="small"
                :readonly="!canUserEditEmote || isMobileMode"
                @emoji-selected="setIcon($event, table)"
              >
                <template #default>
                  <NcTooltip class="flex" placement="topLeft" hide-on-click :disabled="!canUserEditEmote">
                    <template #title>
                      {{ $t('general.changeIcon') }}
                    </template>

                    <component
                      :is="iconMap.table"
                      v-if="table.type === 'table'"
                      class="w-4 text-sm"
                      :class="isTableOpened ? '!text-brand-600/85' : '!text-gray-600/75'"
                    />

                    <MdiEye v-else class="flex w-5 text-sm" :class="isTableOpened ? '!text-brand-600' : '!text-gray-600'" />
                  </NcTooltip>
                </template>
              </LazyGeneralEmojiPicker>
            </div>
          </div>
        </div>
        <NcTooltip
          class="nc-tbl-title nc-sidebar-node-title text-ellipsis overflow-hidden select-none !flex-1"
          show-on-truncate-only
        >
          <template #title>{{ table.title }}</template>
          <span
            :class="isTableOpened ? 'text-brand-600 !font-medium' : 'text-gray-600'"
            :data-testid="`nc-tbl-title-${table.title}`"
            :style="{ wordBreak: 'keep-all', whiteSpace: 'nowrap', display: 'inline' }"
          >
            {{ table.title }}
          </span>
        </NcTooltip>

        <NcDropdown v-model:visible="isOptionsOpen" :trigger="['click']" @click.stop>
          <NcButton
            v-e="['c:table:option']"
            class="nc-sidebar-node-btn nc-tbl-context-menu text-gray-700 hover:text-gray-800"
            :class="{
              '!opacity-100 !inline-block': isOptionsOpen,
            }"
            data-testid="nc-sidebar-table-context-menu"
            type="text"
            size="xxsmall"
            @click.stop
          >
            <MdiDotsHorizontal class="!text-current" />
          </NcButton>

          <template #overlay>
            <NcMenu class="!min-w-62.5" :data-testid="`sidebar-table-context-menu-list-${table.title}`">
              <NcTooltip>
                <template #title> {{ $t('labels.clickToCopyTableID') }} </template>
                <div
                  class="flex items-center justify-between p-2 mx-1.5 rounded-md cursor-pointer hover:bg-gray-100 group"
                  @click.stop="onTableIdCopy"
                >
                  <div class="flex text-xs font-bold text-gray-500 ml-1">
                    {{
                      $t('labels.tableIdColon', {
                        tableId: table?.id,
                      })
                    }}
                  </div>
                  <NcButton class="!group-hover:bg-gray-100" size="xsmall" type="secondary">
                    <GeneralIcon v-if="isTableIdCopied" class="max-h-4 min-w-4" icon="check" />
                    <GeneralIcon v-else class="max-h-4 min-w-4" else icon="copy" />
                  </NcButton>
                </div>
              </NcTooltip>

              <template
                v-if="
                  !isSharedBase &&
                  (isUIAllowed('tableRename', { roles: baseRole, source }) ||
                    isUIAllowed('tableDelete', { roles: baseRole, source }))
                "
              >
                <NcDivider />
                <NcMenuItem
                  v-if="isUIAllowed('tableRename', { roles: baseRole, source })"
                  :data-testid="`sidebar-table-rename-${table.title}`"
                  class="nc-table-rename"
                  @click="openRenameTableDialog(table, source.id)"
                >
                  <div v-e="['c:table:rename']" class="flex gap-2 items-center">
                    <GeneralIcon icon="rename" class="text-gray-700" />
                    {{ $t('general.rename') }} {{ $t('objects.table').toLowerCase() }}
                  </div>
                </NcMenuItem>

                <NcMenuItem
                  v-if="
                    isUIAllowed('tableDuplicate', {
                      source,
                    }) &&
                    base.sources?.[sourceIndex] &&
                    (source.is_meta || source.is_local)
                  "
                  :data-testid="`sidebar-table-duplicate-${table.title}`"
                  @click="duplicateTable(table)"
                >
                  <div v-e="['c:table:duplicate']" class="flex gap-2 items-center">
                    <GeneralIcon icon="duplicate" class="text-gray-700" />
                    {{ $t('general.duplicate') }} {{ $t('objects.table').toLowerCase() }}
                  </div>
                </NcMenuItem>

                <NcDivider />
                <NcMenuItem
                  v-if="isUIAllowed('tableDelete', { roles: baseRole, source })"
                  :data-testid="`sidebar-table-delete-${table.title}`"
                  class="!text-red-500 !hover:bg-red-50 nc-table-delete"
                  @click="deleteTable"
                >
                  <div v-e="['c:table:delete']" class="flex gap-2 items-center">
                    <GeneralIcon icon="delete" />
                    {{ $t('general.delete') }} {{ $t('objects.table').toLowerCase() }}
                  </div>
                </NcMenuItem>
              </template>
            </NcMenu>
          </template>
        </NcDropdown>

        <NcButton
          v-e="['c:table:toggle-expand']"
          type="text"
          size="xxsmall"
          class="nc-sidebar-node-btn nc-sidebar-expand text-gray-700 hover:text-gray-800"
          :class="{
            '!opacity-100 !visible': isOptionsOpen,
          }"
          @click.stop="onExpand"
        >
          <GeneralIcon
            icon="chevronRight"
            class="nc-sidebar-source-node-btns cursor-pointer transform transition-transform duration-200 !text-current text-[20px]"
            :class="{ '!rotate-90': isExpanded }"
          />
        </NcButton>
      </div>
    </div>
    <DlgTableDelete
      v-if="table.id && base?.id"
      v-model:visible="isTableDeleteDialogVisible"
      :table-id="table.id"
      :base-id="base.id"
    />

    <DashboardTreeViewViewsList v-if="isExpanded" :table-id="table.id" :base-id="base.id" @deleted="refreshViews" />
  </div>
</template>

<style scoped lang="scss">
.nc-tree-item {
  @apply relative after:(pointer-events-none content-[''] rounded absolute top-0 left-0  w-full h-full right-0 !bg-current transition duration-100 opacity-0);
}

.nc-tree-item svg {
  @apply text-primary text-opacity-60;
}
</style>
