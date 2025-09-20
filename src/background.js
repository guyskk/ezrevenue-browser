import browser from 'webextension-polyfill'
import { EzrevenueClient } from './ezrevenue.js'
import { generateDeviceUniqueId } from './stringRandom.js'

export function createDeviceIdGetter({ prefix, storageKey } = {}) {
  prefix = prefix || ''
  storageKey = storageKey || 'ezrevenueDeviceId'
  /**
   * 获取或生成设备唯一ID
   * @returns {Promise<string>} 设备唯一ID
   * @description 优先从browser.storage.sync读取设备ID，不存在则从本地存储迁移，最后生成新ID并存储到云端同步
   */
  async function getOrCreateDeviceId() {
    // 首先尝试从云端同步存储获取
    const syncData = await browser.storage.sync.get(storageKey)
    let deviceId = syncData[storageKey]
    
    if (deviceId) {
      console.log(`get deviceId from sync storage: ${deviceId}`)
      return deviceId
    }
    
    // 如果云端没有，尝试从本地存储获取（兼容历史数据）
    const localData = await browser.storage.local.get(storageKey)
    deviceId = localData[storageKey]
    
    if (deviceId) {
      console.log(`migrate deviceId from local storage: ${deviceId}`)
      try {
        // 将本地设备ID迁移到云端存储
        await browser.storage.sync.set({ [storageKey]: deviceId })
        console.log(`successfully migrated deviceId to sync storage: ${deviceId}`)
      } catch (error) {
        console.warn(`failed to migrate deviceId to sync storage:`, error)
        // 如果云端存储失败，继续使用本地存储的设备ID
      }
      return deviceId
    }
    
    // 如果本地和云端都没有，生成新的设备ID
    deviceId = prefix + generateDeviceUniqueId()
    console.log(`create new deviceId: ${deviceId}`)
    try {
      await browser.storage.sync.set({ [storageKey]: deviceId })
      console.log(`successfully stored new deviceId to sync storage: ${deviceId}`)
    } catch (error) {
      console.warn(`failed to store deviceId to sync storage, fallback to local storage:`, error)
      // 如果云端存储失败，回退到本地存储
      await browser.storage.local.set({ [storageKey]: deviceId })
    }
    
    return deviceId
  }
  return getOrCreateDeviceId
}

export function registerEzrevenueBackground({
  projectId,
  projectSecret,
  paywallAlias,
  customerIdGetter,
}) {
  paywallAlias = paywallAlias || 'paywall_vip'
  if (!customerIdGetter) {
    customerIdGetter = createDeviceIdGetter()
  }

  /* 获取用户ID(设备ID)
   * https://www.ezboti.com/docs/revenue/api-customer-info/
   */
  const getCustomerId = customerIdGetter

  // 暂存会员信息
  const state = {
    customerInfo: null,
    lastChecked: null,
  }

  /**
   * 获取会员信息(外层包装)
   * @param {Object} request 请求参数
   * @param {boolean} [request.refresh] 是否强制刷新
   * @returns {Promise<Object>} 返回结果对象为会员信息
   */
  async function getCustomerInfo(request) {
    const customerInfo = await getCustomerInfoAsync(request)
    return customerInfo
  }

  /**
   * 获取会员信息(带缓存逻辑)
   * @param {Object} request 请求参数
   * @param {boolean} [request.refresh] 是否强制刷新
   * @returns {Promise<Object>} 会员信息对象
   * @description 缓存有效期30分钟，过期或强制刷新时重新获取
   */
  async function getCustomerInfoAsync(request) {
    if (request?.refresh) {
      state.customerInfo = null
      state.lastChecked = null
    }
    if (state.customerInfo) {
      let lastChecked = state.lastChecked
      let isExpired = Date.now() - lastChecked > 30 * 60 * 1000
      if (!lastChecked || isExpired) {
        state.customerInfo = null
        state.lastChecked = null
      }
    }
    if (!state.customerInfo) {
      state.customerInfo = await getCustomerInfoImpl()
      state.lastChecked = Date.now()
    }
    return state.customerInfo
  }

  /**
   * 调用艺爪API获取会员信息
   * @returns {Promise<Object>} 会员信息对象
   * @throws {Error} API调用失败时抛出异常
   * @description 查询VIP会员状态
   */
  async function getCustomerInfoImpl() {
    let client = EzrevenueClient({
      projectId: projectId,
      projectSecret: projectSecret,
    })
    let userId = await getCustomerId()
    let res = await client.call('customer.info', {
      paywall_alias: paywallAlias,
      customer: {
        external_id: userId,
      },
      include_balance: true,
    })
    console.log('customerInfo', res)
    return res
  }

  /**
   * 显示支付界面弹窗
   * @description 居中显示800x600的支付界面窗口，关闭后刷新会员状态
   */
  async function showPaywallPopup(config) {
    let vipInfo = await getCustomerInfo()
    return await showPaywallPopupImpl(vipInfo, config)
  }

  async function showPaywallPopupImpl(vipInfo, config) {
    let paywallUrl = vipInfo.home_link.url
    if (!paywallUrl) {
      return null
    }
    let screenWidth = config?.screenWidth || 800
    let screenHeight = config?.screenHeight || 600
    let popupWidth = Math.min(screenWidth - 32, 800)
    let popupHeight = Math.min(screenHeight - 32, 600)
    const popup = await browser.windows.create({
      url: paywallUrl,
      type: 'popup',
      width: popupWidth,
      height: popupHeight,
      left: Math.round((screenWidth - popupWidth) / 2),
      top: Math.round((screenHeight - popupHeight) / 2),
    })
    const myPopupId = popup.id
    console.log(`Window created with ID: ${myPopupId}`)
    return await new Promise((resolve) => {
      const handler = async (windowId) => {
        if (windowId === myPopupId) {
          browser.windows.onRemoved.removeListener(handler)
          let vipInfo = await getCustomerInfo({ refresh: true })
          resolve(vipInfo)
        }
      }
      browser.windows.onRemoved.addListener(handler)
    })
  }

  /** 判断会员权益是否可用 */
  async function isBalanceUsable({ equityId, equityAlias } = {}) {
    let info = await getCustomerInfo()
    let vipBalance = info.balance_s.find((x) => {
      if (equityId) {
        return x.equity.id === equityId
      } else {
        return x.equity.alias === equityAlias || 'equity_vip'
      }
    })
    return vipBalance?.is_balance_usable
  }

  const actionMap = {
    getCustomerId,
    getCustomerInfo,
    showPaywallPopup,
    isBalanceUsable,
  }

  /**
   * 监听来自popup/content-script/options页面的消息
   */
  const actionHandlerMap = {}
  Object.keys(actionMap).forEach((action) => {
    actionHandlerMap[`ezrevenue_${action}`] = actionMap[action]
  })
  browser.runtime.onMessage.addListener((request) => {
    if (!request.action) {
      return
    }
    let handlerFunc = actionHandlerMap[request.action]
    if (!handlerFunc) {
      return
    }
    console.log('ezrevenue request:', request)
    return handlerFunc(request.data)
  })

  const self = {
    projectId,
    projectSecret,
    paywallAlias,
    ...actionMap,
  }

  return self
}
