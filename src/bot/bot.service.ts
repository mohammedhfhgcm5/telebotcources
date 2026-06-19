import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { Markup, Telegraf } from 'telegraf'
import { PrismaService } from '../prisma/prisma.service'

const CHANNEL_URL = 'https://t.me/+9p5va-ySLRkzMjE0'

  const message = `
  اهلاً . في بوت قلم حقوقي ☺️ إختر من الأزرار أدناه 

البوت يتم تحديثه أولاً بِأوّل لمواكبة كل جديد
بإشراف أ.فاروق قلة 
:القناة الرئيسية
${CHANNEL_URL}
`;  

const BUTTONS = {
  browse: '📚 تصفح الملفات',
  channelLink: '📢 رابط القناة الرئيسية',
  admin: '⚙️ لوحة الإدارة',

  // File types
  ftBank: '🏦 بنك قلم حقوقي',
  ftGolden: '🌟 دهبية',
  ftCourses: '🎓 دورات',
  ftRecordings: '🎥 تسجيلات المادة',

  // Admin
  addYear: '➕ إضافة سنة',
  addTerm: '➕ إضافة فصل',
  addCourse: '➕ إضافة مادة',
  addFile: '📎 إضافة ملف',
  deleteFile: '🗑️ حذف ملف',
  deleteTerm: '🗑️ حذف فصل',
  deleteCourse: '🗑️ حذف مادة',
  addAdmin: '👤 إضافة أدمن',
  listAdmins: '📋 قائمة الأدمن',
  removeAdmin: '❌ حذف أدمن',
  stats: '📊 الإحصائيات',
  userCount: '👥 عدد المستخدمين',
  listUsers: '📋 قائمة المستخدمين',
  searchUser: '🔍 بحث عن مستخدم',
  back: '⬅️ رجوع',
  cancel: '❌ إلغاء',
  mainMenu: '🏠 القائمة الرئيسية',
} as const

type FileType = 'SUMMARY' | 'BANK' | 'GOLDEN' | 'COURSES' | 'RECORDINGS'
type MediaKind = 'document' | 'audio' | 'voice'

const FILE_TYPE_LABELS: Record<FileType, string> = {
  SUMMARY: 'ملخص قلم حقوقي',
  BANK: 'بنك قلم حقوقي',
  GOLDEN: 'دهبية',
  COURSES: 'دورات',
  RECORDINGS: 'تسجيلات المادة',
}

const FILE_TYPE_BUTTONS: Record<string, FileType> = {
  [BUTTONS.ftBank]: 'BANK',
  [BUTTONS.ftGolden]: 'GOLDEN',
  [BUTTONS.ftCourses]: 'COURSES',
  [BUTTONS.ftRecordings]: 'RECORDINGS',
}

const USERS_PER_PAGE = 50

// ─── User state ───────────────────────────────────────────────────────────────
type UserState =
  | { mode: 'idle' }
  | { mode: 'browseYear' }
  | { mode: 'browseTerm'; yearId: number; choices: Record<string, number> }
  | { mode: 'browseCourse'; yearId: number; termId: number; choices: Record<string, number> }
  | { mode: 'browseFileType'; yearId: number; termId: number; courseId: number }
  | { mode: 'adminPanel' }
  | { mode: 'statsPanel' }
  | { mode: 'searchUser' }
  | { mode: 'addYearName' }
  | { mode: 'addTermYear' }
  | { mode: 'addTermName'; yearId: number }
  | { mode: 'addCourseYear' }
  | { mode: 'addCourseTerm'; yearId: number; choices: Record<string, number> }
  | { mode: 'addCourseName'; yearId: number; termId: number }
  | { mode: 'addFileYear' }
  | { mode: 'addFileTerm'; yearId: number; choices: Record<string, number> }
  | { mode: 'addFileCourse'; yearId: number; termId: number; choices: Record<string, number> }
  | { mode: 'addFileType'; yearId: number; termId: number; courseId: number }
  | { mode: 'addFileUpload'; yearId: number; termId: number; courseId: number; fileType: FileType }
  | { mode: 'deleteFileYear' }
  | { mode: 'deleteFileTerm'; yearId: number; choices: Record<string, number> }
  | { mode: 'deleteFileCourse'; yearId: number; termId: number; choices: Record<string, number> }
  | { mode: 'deleteFileFile'; yearId: number; termId: number; courseId: number }
  | { mode: 'deleteTermYear' }
  | { mode: 'deleteTermTerm'; yearId: number; choices: Record<string, number> }
  | { mode: 'deleteCourseYear' }
  | { mode: 'deleteCourseTerm'; yearId: number; choices: Record<string, number> }
  | { mode: 'deleteCourseCourse'; yearId: number; termId: number; choices: Record<string, number> }
  | { mode: 'addAdminId' }
  | { mode: 'removeAdminId' }

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  constructor(private prisma: PrismaService) {}

  bot = new Telegraf(process.env.BOT_TOKEN!)
  private readonly userStates = new Map<number, UserState>()
  private keepAliveInterval: NodeJS.Timeout | null = null

  async onModuleInit() {
    this.startKeepAlive()

    this.bot.start(async ctx => {
      await this.trackUser(ctx)
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, message)
    })

    this.bot.command('menu', async ctx => {
      await this.trackUser(ctx)
      this.clearUserState(ctx)
      await this.showMainMenu(ctx)
    })

    this.bot.command('files', async ctx => {
      await this.trackUser(ctx)
      this.clearUserState(ctx)
      await this.showYearsForBrowse(ctx)
    })

    this.bot.on('text', async ctx => {
      await this.handleTextInput(ctx)
    })

    this.bot.on('document', async ctx => {
      await this.handleMediaInput(ctx, 'document')
    })

    this.bot.on('audio', async ctx => {
      await this.handleMediaInput(ctx, 'audio')
    })

    this.bot.on('voice', async ctx => {
      await this.handleMediaInput(ctx, 'voice')
    })

    await this.bot.telegram.deleteWebhook({ drop_pending_updates: true })
    await this.bot.launch()
    console.log('[Bot] Polling started')
  }

  async onModuleDestroy() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval)
    await this.bot.stop('NestJS shutdown')
  }

  // ─── Keep-alive ─────────────────────────────────────────────────────────────
  private startKeepAlive() {
    if (!process.env.KEEP_ALIVE_URL) return
    this.pingServer()
    this.keepAliveInterval = setInterval(() => this.pingServer(), 60 * 60 * 1000)
  }

  private async pingServer() {
    const url = process.env.KEEP_ALIVE_URL
    if (!url) return
    try {
      const res = await fetch(url)
      console.log(`[Keep-alive] ${url} → ${res.status}`)
    } catch (err) {
      console.error('[Keep-alive] Ping failed:', err)
    }
  }

  // ─── User tracking ────────────────────────────────────────────────────────────
  private async trackUser(ctx: any): Promise<void> {
    const from = ctx.from
    if (!from?.id) return
    try {
      await this.prisma.user.upsert({
        where: { id: BigInt(from.id) },
        create: {
          id: BigInt(from.id),
          username: from.username ?? null,
          firstName: from.first_name ?? null,
          lastName: from.last_name ?? null,
        },
        update: {
          username: from.username ?? null,
          firstName: from.first_name ?? null,
          lastName: from.last_name ?? null,
        },
      })
    } catch (error) {
      console.error('Error tracking user:', error)
    }
  }

  // ─── Admin check ────────────────────────────────────────────────────────────
  private async isAdmin(userId: number): Promise<boolean> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { id: BigInt(userId) },
        select: { id: true },
      })
      return Boolean(admin)
    } catch (error) {
      console.error('Error checking admin status:', error)
      return false
    }
  }

  private async ensureAdminAccess(ctx: any, userId?: number): Promise<boolean> {
    if (!userId || !(await this.isAdmin(userId))) {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, 'ليس لديك صلاحيات الأدمن.')
      return false
    }
    return true
  }

  // ─── Main menu ──────────────────────────────────────────────────────────────
  private async showMainMenu(ctx: any, text = message) {
    this.setUserState(ctx, { mode: 'idle' })
    const userId = ctx.from?.id
    const admin = userId ? await this.isAdmin(userId) : false
    await ctx.reply(text, this.mainKeyboard(admin))
  }

  // ─── Admin panel ────────────────────────────────────────────────────────────
  private async showAdminPanel(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    this.setUserState(ctx, { mode: 'adminPanel' })
    await ctx.reply('لوحة الإدارة:', this.adminKeyboard())
  }

  // ─── Stats panel ────────────────────────────────────────────────────────────
  private async showStatsPanel(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    this.setUserState(ctx, { mode: 'statsPanel' })
    await ctx.reply('📊 لوحة الإحصائيات:', this.statsKeyboard())
  }

  private async showUserCount(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    try {
      const now = Date.now()
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

      const [total, last24h, lastMonth] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
        this.prisma.user.count({ where: { lastSeenAt: { gte: monthAgo } } }),
      ])

      await ctx.reply(
        `📊 إحصائيات المستخدمين:\n\n` +
          `👥 الإجمالي: ${total}\n` +
          `🕐 نشطون آخر 24 ساعة: ${last24h}\n` +
          `📅 نشطون آخر شهر: ${lastMonth}`,
        this.statsKeyboard(),
      )
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب الإحصائيات.', this.statsKeyboard())
    }
  }

  private formatUserEntry(
    user: {
      id: bigint
      username: string | null
      firstName: string | null
      lastName: string | null
      createdAt: Date
      lastSeenAt: Date
    },
    index: number,
  ): string {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—'
    const username = user.username ? `@${user.username}` : '—'
    const joined = user.createdAt.toISOString().slice(0, 10)
    const lastSeen = user.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')
    return (
      `${index}. ID: ${user.id}\n` +
      `   الاسم: ${name}\n` +
      `   المعرف: ${username}\n` +
      `   انضم: ${joined}\n` +
      `   آخر نشاط: ${lastSeen}`
    )
  }

  private async listUsers(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    try {
      const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
      if (users.length === 0) {
        await ctx.reply('لا يوجد مستخدمون مسجلون بعد.', this.statsKeyboard())
        return
      }

      const total = users.length
      for (let offset = 0; offset < total; offset += USERS_PER_PAGE) {
        const chunk = users.slice(offset, offset + USERS_PER_PAGE)
        const from = offset + 1
        const to = offset + chunk.length
        const list = chunk.map((user, i) => this.formatUserEntry(user, offset + i + 1)).join('\n\n')
        const header = `📋 المستخدمون (${from}-${to} من ${total}):\n\n`
        const keyboard = offset + USERS_PER_PAGE >= total ? this.statsKeyboard() : undefined
        await ctx.reply(header + list, keyboard)
      }
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب قائمة المستخدمين.', this.statsKeyboard())
    }
  }

  private async searchUserByQuery(ctx: any, query: string) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    const trimmed = query.trim().replace(/^@/, '')
    if (!trimmed) {
      await ctx.reply('أرسل ID أو اسم المستخدم للبحث.', this.statsKeyboard())
      return
    }

    try {
      let users: Array<{
        id: bigint
        username: string | null
        firstName: string | null
        lastName: string | null
        createdAt: Date
        lastSeenAt: Date
      }> = []

      if (/^\d+$/.test(trimmed)) {
        const user = await this.prisma.user.findUnique({ where: { id: BigInt(trimmed) } })
        if (user) users = [user]
      } else {
        users = await this.prisma.user.findMany({
          where: {
            OR: [
              { username: { contains: trimmed, mode: 'insensitive' } },
              { firstName: { contains: trimmed, mode: 'insensitive' } },
              { lastName: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
          take: 20,
          orderBy: { lastSeenAt: 'desc' },
        })
      }

      this.setUserState(ctx, { mode: 'statsPanel' })

      if (users.length === 0) {
        await ctx.reply('لم يتم العثور على مستخدم.', this.statsKeyboard())
        return
      }

      const list = users.map((user, i) => this.formatUserEntry(user, i + 1)).join('\n\n')
      await ctx.reply(`🔍 نتائج البحث (${users.length}):\n\n${list}`, this.statsKeyboard())
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ أثناء البحث.', this.statsKeyboard())
    }
  }

  // ─── Admin panel (continued) ────────────────────────────────────────────────
  private async showYearsForBrowse(ctx: any, text = 'اختر السنة:') {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) {
        await this.showMainMenu(ctx, 'لا توجد سنوات حاليا.')
        return
      }
      this.setUserState(ctx, { mode: 'browseYear' })
      await ctx.reply(text, this.yearsKeyboard(years))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب السنوات.')
    }
  }

  // ─── Browse: Terms ──────────────────────────────────────────────────────────
  private async showTermsForBrowse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { id: 'asc' } })
      if (terms.length === 0) {
        await this.showYearsForBrowse(ctx, 'لا توجد فصول في هذه السنة. اختر سنة أخرى:')
        return
      }
      this.setUserState(ctx, { mode: 'browseTerm', yearId, choices: this.buildChoices(terms) })
      await ctx.reply('اختر الفصل:', this.termsKeyboard(terms))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب الفصول.')
    }
  }

  // ─── Browse: Courses ────────────────────────────────────────────────────────
  private async showCoursesForBrowse(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { id: 'asc' } })
      if (courses.length === 0) {
        await this.showTermsForBrowse(ctx, yearId)
        return
      }
      this.setUserState(ctx, { mode: 'browseCourse', yearId, termId, choices: this.buildChoices(courses) })
      await ctx.reply('اختر المادة:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب المواد.')
    }
  }

  // ─── Browse: File type ──────────────────────────────────────────────────────
  // ← حذفنا showEduTypeForBrowse وصرنا نروح مباشرة لنوع الملف
  private async showFileTypeForBrowse(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
  ) {
    this.setUserState(ctx, { mode: 'browseFileType', yearId, termId, courseId })
    await ctx.reply('اختر نوع الملف:', this.fileTypeKeyboard())
  }

  // ─── Browse: Files ──────────────────────────────────────────────────────────
  private async showFilesForBrowse(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
    fileType: FileType,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: {
          files: {
            where: { fileType },  // ← حذفنا فلتر educationType
            orderBy: { id: 'desc' },
          },
        },
      })

      if (!course || course.termId !== termId) {
        await this.showCoursesForBrowse(ctx, yearId, termId)
        return
      }

      if (course.files.length === 0) {
        await ctx.reply(
          `لا توجد ملفات من نوع "${FILE_TYPE_LABELS[fileType]}" في هذه المادة.`,
        )
        await this.showFileTypeForBrowse(ctx, yearId, termId, courseId)
        return
      }

      for (const file of course.files) {
        try {
          await this.sendFile(ctx, file)
        } catch {
          await ctx.reply(`تعذر إرسال الملف: ${file.name ?? `#${file.id}`}`)
        }
      }

      await this.showYearsForBrowse(ctx, 'تم إرسال الملفات. اختر السنة:')
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب الملفات.')
    }
  }

  private async sendFile(
    ctx: any,
    file: { id: number; fileId: string; name: string | null; mediaKind?: string | null },
  ) {
    const caption = file.name ?? undefined
    const kind = (file.mediaKind ?? 'document') as MediaKind

    if (kind === 'audio') {
      await ctx.replyWithAudio(file.fileId, { caption })
    } else if (kind === 'voice') {
      await ctx.replyWithVoice(file.fileId, { caption })
    } else {
      await ctx.replyWithDocument(file.fileId, { caption })
    }
  }

  // ─── Admin: Years for add term ──────────────────────────────────────────────
  private async showYearsForAddTerm(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addTermYear' })
      await ctx.reply('اختر السنة لإضافة فصل:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: Years/Terms for add course ─────────────────────────────────────
  private async showYearsForAddCourse(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addCourseYear' })
      await ctx.reply('اختر السنة لإضافة مادة:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForAddCourse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { id: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addCourseTerm', yearId, choices: this.buildChoices(terms) })
      await ctx.reply('اختر الفصل لإضافة مادة:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: add file – navigation ──────────────────────────────────────────
  private async showYearsForAddFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addFileYear' })
      await ctx.reply('اختر السنة لإضافة ملف:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForAddFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { id: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addFileTerm', yearId, choices: this.buildChoices(terms) })
      await ctx.reply('اختر الفصل لإضافة ملف:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showCoursesForAddFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { id: 'asc' } })
      if (courses.length === 0) { await ctx.reply('لا توجد مواد في هذا الفصل. أضف مادة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addFileCourse', yearId, termId, choices: this.buildChoices(courses) })
      await ctx.reply('اختر المادة لإضافة ملف:', this.coursesKeyboard(courses))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ← حذفنا showEduTypeForAddFile وصرنا نروح مباشرة لنوع الملف
  private async showFileTypeForAddFile(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
  ) {
    this.setUserState(ctx, { mode: 'addFileType', yearId, termId, courseId })
    await ctx.reply('اختر نوع الملف:', this.fileTypeKeyboard())
  }

  // ─── Admin: delete file – navigation ───────────────────────────────────────
  private async showYearsForDeleteFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات حاليا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteFileYear' })
      await ctx.reply('اختر السنة لحذف ملف:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForDeleteFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { id: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteFileTerm', yearId, choices: this.buildChoices(terms) })
      await ctx.reply('اختر الفصل لحذف ملف:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showCoursesForDeleteFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { id: 'asc' } })
      if (courses.length === 0) { await ctx.reply('لا توجد مواد في هذا الفصل.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteFileCourse', yearId, termId, choices: this.buildChoices(courses) })
      await ctx.reply('اختر المادة لحذف ملف منها:', this.coursesKeyboard(courses))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showFilesForDeleteFile(ctx: any, yearId: number, termId: number, courseId: number) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: { files: { orderBy: { id: 'desc' } } },
      })
      if (!course || course.termId !== termId) { await this.showCoursesForDeleteFile(ctx, yearId, termId); return }
      if (course.files.length === 0) {
        await ctx.reply('لا توجد ملفات لهذه المادة.', this.adminKeyboard())
        await this.showCoursesForDeleteFile(ctx, yearId, termId)
        return
      }
      this.setUserState(ctx, { mode: 'deleteFileFile', yearId, termId, courseId })
      await ctx.reply('اختر الملف المراد حذفه:', this.filesKeyboard(course.files))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: delete term – navigation ───────────────────────────────────────
  private async showYearsForDeleteTerm(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات حاليا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteTermYear' })
      await ctx.reply('اختر السنة لحذف فصل:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForDeleteTerm(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { id: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteTermTerm', yearId, choices: this.buildChoices(terms) })
      await ctx.reply('اختر الفصل المراد حذفه:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: delete course – navigation ─────────────────────────────────────
  private async showYearsForDeleteCourse(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { id: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات حاليا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteCourseYear' })
      await ctx.reply('اختر السنة لحذف مادة:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForDeleteCourse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { id: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteCourseTerm', yearId, choices: this.buildChoices(terms) })
      await ctx.reply('اختر الفصل لحذف مادة:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showCoursesForDeleteCourse(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { id: 'asc' } })
      if (courses.length === 0) { await ctx.reply('لا توجد مواد في هذا الفصل.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteCourseCourse', yearId, termId, choices: this.buildChoices(courses) })
      await ctx.reply('اختر المادة المراد حذفها:', this.coursesKeyboard(courses))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: list admins ─────────────────────────────────────────────────────
  private async listAdmins(ctx: any) {
    try {
      const admins = await this.prisma.admin.findMany({ orderBy: { id: 'asc' } })
      if (admins.length === 0) { await ctx.reply('لا يوجد أدمن في النظام.', this.adminKeyboard()); return }
      const list = admins.map(a => `• ${a.id.toString()}`).join('\n')
      await ctx.reply(`قائمة الأدمن:\n${list}`, this.adminKeyboard())
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Text handler ───────────────────────────────────────────────────────────
  private async handleTextInput(ctx: any) {
    await this.trackUser(ctx)
    const text = ctx.message?.text?.trim()
    const userId = ctx.from?.id
    if (!text) return

    if (text === BUTTONS.mainMenu) { this.clearUserState(ctx); await this.showMainMenu(ctx); return }
    if (text === BUTTONS.cancel) { this.clearUserState(ctx); await this.showMainMenu(ctx, 'تم الإلغاء.'); return }

    const state = this.getUserState(ctx)

    if (state.mode === 'idle') { await this.handleMainMenuButtons(ctx, text); return }
    if (state.mode === 'adminPanel') { await this.handleAdminPanelButtons(ctx, text); return }
    if (state.mode === 'statsPanel') { await this.handleStatsPanelButtons(ctx, text); return }

    // ── Browse: year ──
    if (state.mode === 'browseYear') {
      if (text === BUTTONS.back) { await this.showMainMenu(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForBrowse(ctx, yearId)
      return
    }

    // ── Browse: term ──
    if (state.mode === 'browseTerm') {
      if (text === BUTTONS.back) { await this.showYearsForBrowse(ctx); return }
      const termId = this.resolveChoice(state.choices, text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForBrowse(ctx, state.yearId, termId)
      return
    }

    // ── Browse: course ──
    if (state.mode === 'browseCourse') {
      if (text === BUTTONS.back) { await this.showTermsForBrowse(ctx, state.yearId); return }
      const courseId = this.resolveChoice(state.choices, text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      // ← مباشرة لنوع الملف بدون eduType
      await this.showFileTypeForBrowse(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Browse: file type ──
    if (state.mode === 'browseFileType') {
      if (text === BUTTONS.back) {
        await this.showCoursesForBrowse(ctx, state.yearId, state.termId)
        return
      }
      const fileType = FILE_TYPE_BUTTONS[text]
      if (!fileType) { await ctx.reply('اختر نوع الملف من الأزرار.'); return }
      await this.showFilesForBrowse(ctx, state.yearId, state.termId, state.courseId, fileType)
      return
    }

    // ── Admin-only from here ──
    if (!(await this.ensureAdminAccess(ctx, userId))) return

    // ── Add year: name ──
    if (state.mode === 'addYearName') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      await this.createYear(ctx, text)
      return
    }

    // ── Add term: year ──
    if (state.mode === 'addTermYear') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      this.setUserState(ctx, { mode: 'addTermName', yearId })
      await ctx.reply('أرسل اسم الفصل الجديد:', this.cancelKeyboard())
      return
    }

    // ── Add term: name ──
    if (state.mode === 'addTermName') {
      if (text === BUTTONS.back) { await this.showYearsForAddTerm(ctx); return }
      await this.createTerm(ctx, state.yearId, text)
      return
    }

    // ── Add course: year ──
    if (state.mode === 'addCourseYear') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForAddCourse(ctx, yearId)
      return
    }

    // ── Add course: term ──
    if (state.mode === 'addCourseTerm') {
      if (text === BUTTONS.back) { await this.showYearsForAddCourse(ctx); return }
      const termId = this.resolveChoice(state.choices, text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      this.setUserState(ctx, { mode: 'addCourseName', yearId: state.yearId, termId })
      await ctx.reply('أرسل اسم المادة الجديدة:', this.cancelKeyboard())
      return
    }

    // ── Add course: name ──
    if (state.mode === 'addCourseName') {
      if (text === BUTTONS.back) { await this.showTermsForAddCourse(ctx, state.yearId); return }
      await this.createCourse(ctx, state.termId, text)
      return
    }

    // ── Add file: year ──
    if (state.mode === 'addFileYear') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForAddFile(ctx, yearId)
      return
    }

    // ── Add file: term ──
    if (state.mode === 'addFileTerm') {
      if (text === BUTTONS.back) { await this.showYearsForAddFile(ctx); return }
      const termId = this.resolveChoice(state.choices, text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForAddFile(ctx, state.yearId, termId)
      return
    }

    // ── Add file: course ──
    if (state.mode === 'addFileCourse') {
      if (text === BUTTONS.back) { await this.showTermsForAddFile(ctx, state.yearId); return }
      const courseId = this.resolveChoice(state.choices, text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      // ← مباشرة لنوع الملف بدون eduType
      await this.showFileTypeForAddFile(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Add file: file type ──
    if (state.mode === 'addFileType') {
      if (text === BUTTONS.back) {
        await this.showCoursesForAddFile(ctx, state.yearId, state.termId)
        return
      }
      const fileType = FILE_TYPE_BUTTONS[text]
      if (!fileType) { await ctx.reply('اختر نوع الملف من الأزرار.'); return }
      this.setUserState(ctx, {
        mode: 'addFileUpload',
        yearId: state.yearId,
        termId: state.termId,
        courseId: state.courseId,
        fileType,
      })
      await ctx.reply(
        `نوع الملف: ${FILE_TYPE_LABELS[fileType]}\n\nأرسل الملف (document / audio / voice) أو أرسل file_id كنص:`,
        this.cancelKeyboard(),
      )
      return
    }

    // ── Add file: upload (text = file_id) ──
    if (state.mode === 'addFileUpload') {
      if (text === BUTTONS.back) {
        await this.showFileTypeForAddFile(ctx, state.yearId, state.termId, state.courseId)
        return
      }
      await this.createCourseFile(
        ctx,
        state.courseId,
        state.termId,
        text,
        undefined,
        state.fileType,
        'document',
      )
      return
    }

    // ── Delete file: year ──
    if (state.mode === 'deleteFileYear') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForDeleteFile(ctx, yearId)
      return
    }

    // ── Delete file: term ──
    if (state.mode === 'deleteFileTerm') {
      if (text === BUTTONS.back) { await this.showYearsForDeleteFile(ctx); return }
      const termId = this.resolveChoice(state.choices, text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForDeleteFile(ctx, state.yearId, termId)
      return
    }

    // ── Delete file: course ──
    if (state.mode === 'deleteFileCourse') {
      if (text === BUTTONS.back) { await this.showTermsForDeleteFile(ctx, state.yearId); return }
      const courseId = this.resolveChoice(state.choices, text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      await this.showFilesForDeleteFile(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Delete file: file ──
    if (state.mode === 'deleteFileFile') {
      if (text === BUTTONS.back) { await this.showCoursesForDeleteFile(ctx, state.yearId, state.termId); return }
      const fileRowId = this.parseFileRowId(text)
      if (!fileRowId) { await ctx.reply('اختر ملف من الأزرار.'); return }
      await this.deleteCourseFile(ctx, state.yearId, state.termId, state.courseId, fileRowId)
      return
    }

    // ── Delete term: year ──
    if (state.mode === 'deleteTermYear') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForDeleteTerm(ctx, yearId)
      return
    }

    // ── Delete term: term ──
    if (state.mode === 'deleteTermTerm') {
      if (text === BUTTONS.back) { await this.showYearsForDeleteTerm(ctx); return }
      const termId = this.resolveChoice(state.choices, text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.deleteTerm(ctx, state.yearId, termId)
      return
    }

    // ── Delete course: year ──
    if (state.mode === 'deleteCourseYear') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForDeleteCourse(ctx, yearId)
      return
    }

    // ── Delete course: term ──
    if (state.mode === 'deleteCourseTerm') {
      if (text === BUTTONS.back) { await this.showYearsForDeleteCourse(ctx); return }
      const termId = this.resolveChoice(state.choices, text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForDeleteCourse(ctx, state.yearId, termId)
      return
    }

    // ── Delete course: course ──
    if (state.mode === 'deleteCourseCourse') {
      if (text === BUTTONS.back) { await this.showTermsForDeleteCourse(ctx, state.yearId); return }
      const courseId = this.resolveChoice(state.choices, text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      await this.deleteCourse(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Add admin ──
    if (state.mode === 'addAdminId') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      await this.addAdmin(ctx, text)
      return
    }

    // ── Remove admin ──
    if (state.mode === 'removeAdminId') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      await this.removeAdmin(ctx, text)
      return
    }

    // ── Search user ──
    if (state.mode === 'searchUser') {
      if (text === BUTTONS.back) { await this.showStatsPanel(ctx); return }
      await this.searchUserByQuery(ctx, text)
      return
    }
  }

  // ─── Unified media handler ──────────────────────────────────────────────────
  private async handleMediaInput(ctx: any, kind: MediaKind) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return

    const state = this.getUserState(ctx)
    if (state.mode !== 'addFileUpload') return

    let fileId: string | undefined
    let fileName: string | undefined

    if (kind === 'document') {
      fileId = ctx.message?.document?.file_id
      fileName = ctx.message?.document?.file_name ?? undefined
    } else if (kind === 'audio') {
      fileId = ctx.message?.audio?.file_id
      fileName = ctx.message?.audio?.file_name ?? ctx.message?.audio?.title ?? undefined
    } else if (kind === 'voice') {
      fileId = ctx.message?.voice?.file_id
    }

    if (!fileId) { await ctx.reply('الملف غير صالح.'); return }

    await this.createCourseFile(
      ctx,
      state.courseId,
      state.termId,
      fileId,
      fileName,
      state.fileType,
      kind,
    )
  }

  // ─── Main menu buttons ──────────────────────────────────────────────────────
  private async handleMainMenuButtons(ctx: any, text: string) {
    if (text === BUTTONS.browse) { await this.showYearsForBrowse(ctx); return }
    if (text === BUTTONS.channelLink) { await ctx.reply(`📢 رابط القناة الرئيسية:\n${CHANNEL_URL}`); return }
    if (text === BUTTONS.admin) { await this.showAdminPanel(ctx); return }
    await this.showMainMenu(ctx, 'اختر خيارا من الأزرار.')
  }

  // ─── Admin panel buttons ────────────────────────────────────────────────────
  private async handleAdminPanelButtons(ctx: any, text: string) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    if (text === BUTTONS.back) { await this.showMainMenu(ctx); return }
    if (text === BUTTONS.addYear) {
      this.setUserState(ctx, { mode: 'addYearName' })
      await ctx.reply('أرسل اسم السنة الجديدة:', this.cancelKeyboard())
      return
    }
    if (text === BUTTONS.addTerm) { await this.showYearsForAddTerm(ctx); return }
    if (text === BUTTONS.addCourse) { await this.showYearsForAddCourse(ctx); return }
    if (text === BUTTONS.addFile) { await this.showYearsForAddFile(ctx); return }
    if (text === BUTTONS.deleteFile) { await this.showYearsForDeleteFile(ctx); return }
    if (text === BUTTONS.deleteTerm) { await this.showYearsForDeleteTerm(ctx); return }
    if (text === BUTTONS.deleteCourse) { await this.showYearsForDeleteCourse(ctx); return }
    if (text === BUTTONS.addAdmin) {
      this.setUserState(ctx, { mode: 'addAdminId' })
      await ctx.reply('أرسل ID المستخدم (Telegram User ID):', this.cancelKeyboard())
      return
    }
    if (text === BUTTONS.listAdmins) { await this.listAdmins(ctx); return }
    if (text === BUTTONS.removeAdmin) {
      this.setUserState(ctx, { mode: 'removeAdminId' })
      await ctx.reply('أرسل ID الأدمن المراد حذفه:', this.cancelKeyboard())
      return
    }
    if (text === BUTTONS.stats) { await this.showStatsPanel(ctx); return }
    await this.showAdminPanel(ctx)
  }

  // ─── Stats panel buttons ────────────────────────────────────────────────────
  private async handleStatsPanelButtons(ctx: any, text: string) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
    if (text === BUTTONS.userCount) { await this.showUserCount(ctx); return }
    if (text === BUTTONS.listUsers) { await this.listUsers(ctx); return }
    if (text === BUTTONS.searchUser) {
      this.setUserState(ctx, { mode: 'searchUser' })
      await ctx.reply('أرسل ID المستخدم أو اسمه أو @username للبحث:', this.cancelKeyboard())
      return
    }
    await this.showStatsPanel(ctx)
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────
  private parseBigIntValue(value: string): bigint | null {
    try {
      if (!/^\d+$/.test(value)) return null
      return BigInt(value)
    } catch { return null }
  }

  private async addAdmin(ctx: any, adminIdText: string) {
    const adminId = this.parseBigIntValue(adminIdText)
    if (adminId === null) { await ctx.reply('ID غير صحيح.'); return }
    try {
      await this.prisma.admin.create({ data: { id: adminId } })
      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة الأدمن: ${adminId.toString()}`)
      await this.showAdminPanel(ctx)
    } catch (error) { console.error(error); await ctx.reply('فشل إضافة الأدمن. قد يكون موجود بالفعل.') }
  }

  private async removeAdmin(ctx: any, adminIdText: string) {
    const adminId = this.parseBigIntValue(adminIdText)
    if (adminId === null) { await ctx.reply('ID غير صحيح.'); return }
    const userId = ctx.from?.id
    if (userId && adminId === BigInt(userId)) { await ctx.reply('لا يمكنك حذف نفسك!'); return }
    try {
      await this.prisma.admin.delete({ where: { id: adminId } })
      this.clearUserState(ctx)
      await ctx.reply(`تم حذف الأدمن: ${adminId.toString()}`)
      await this.showAdminPanel(ctx)
    } catch (error) { console.error(error); await ctx.reply('فشل حذف الأدمن. قد يكون غير موجود.') }
  }

  private async createYear(ctx: any, name: string) {
    try {
      const created = await this.prisma.year.create({ data: { name } })
      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة السنة: ${name} (ID: ${created.id})`)
      await this.showAdminPanel(ctx)
    } catch (error: any) { console.error(error); await ctx.reply(`فشل إضافة السنة. الخطأ: ${error.message || 'غير معروف'}`) }
  }

  private async createTerm(ctx: any, yearId: number, name: string) {
    try {
      const year = await this.prisma.year.findUnique({ where: { id: yearId } })
      if (!year) { await ctx.reply('السنة غير موجودة.'); await this.showYearsForAddTerm(ctx); return }
      const created = await this.prisma.term.create({ data: { name, yearId } })
      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة الفصل: ${name} (ID: ${created.id}) للسنة: ${year.name}`)
      await this.showAdminPanel(ctx)
    } catch (error: any) { console.error(error); await ctx.reply(`فشل إضافة الفصل. الخطأ: ${error.message || 'قد يكون مكرر'}`) }
  }

  private async createCourse(ctx: any, termId: number, name: string) {
    try {
      const term = await this.prisma.term.findUnique({ where: { id: termId }, include: { year: true } })
      if (!term) { await ctx.reply('الفصل غير موجود.'); return }
      const created = await this.prisma.course.create({ data: { name, termId } })
      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة المادة: ${name} (ID: ${created.id}) للفصل: ${term.name} - السنة: ${term.year.name}`)
      await this.showAdminPanel(ctx)
    } catch (error: any) { console.error(error); await ctx.reply(`فشل إضافة المادة. الخطأ: ${error.message || 'غير معروف'}`) }
  }

  private async createCourseFile(
    ctx: any,
    courseId: number,
    termId: number,
    fileId: string,
    name?: string,
    fileType: FileType = 'SUMMARY',
    mediaKind: MediaKind = 'document',
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, termId: true, name: true },
      })
      if (!course || course.termId !== termId) { await ctx.reply('المادة غير موجودة.'); return }

      const created = await this.prisma.courseFile.create({
        data: {
          courseId,
          fileId,
          name: name?.trim() || undefined,
          educationType: 'GENERAL',
          fileType,
          mediaKind,
        } as Prisma.CourseFileUncheckedCreateInput,
      })

      const kindLabel: Record<MediaKind, string> = {
        document: '📄 مستند',
        audio: '🎵 صوت',
        voice: '🎙️ رسالة صوتية',
      }

      this.clearUserState(ctx)
      await ctx.reply(
        
        `تمت إضافة ملف جديد (ID: ${created.id})\n` +
        `المادة: ${course.name}\n` +
        `نوع الملف: ${FILE_TYPE_LABELS[fileType]}\n` +
        `نوع الوسائط: ${kindLabel[mediaKind]}`,
      )
      await this.showAdminPanel(ctx)
    } catch (error: any) { console.error(error); await ctx.reply(`فشل إضافة الملف. الخطأ: ${error.message || 'غير معروف'}`) }
  }

  private async deleteCourseFile(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
    fileRowId: number,
  ) {
    try {
      const file = await this.prisma.courseFile.findUnique({
        where: { id: fileRowId },
        select: { id: true, courseId: true, name: true },
      })
      if (!file || file.courseId !== courseId) { await ctx.reply('الملف غير موجود في هذه المادة.'); return }
      await this.prisma.courseFile.delete({ where: { id: fileRowId } })
      await ctx.reply(`تم حذف الملف: ${file.name ?? `#${file.id}`}`)
      await this.showFilesForDeleteFile(ctx, yearId, termId, courseId)
    } catch (error: any) { console.error(error); await ctx.reply(`فشل حذف الملف. الخطأ: ${error.message || 'غير معروف'}`) }
  }

  private async deleteTerm(ctx: any, yearId: number, termId: number) {
    try {
      const term = await this.prisma.term.findUnique({
        where: { id: termId },
        include: { year: true, courses: { select: { id: true } } },
      })
      if (!term || term.yearId !== yearId) {
        await ctx.reply('الفصل غير موجود في هذه السنة.')
        await this.showTermsForDeleteTerm(ctx, yearId)
        return
      }

      await this.prisma.$transaction(async tx => {
        const courseIds = term.courses.map(c => c.id)
        if (courseIds.length > 0) {
          await tx.courseFile.deleteMany({ where: { courseId: { in: courseIds } } })
          await tx.course.deleteMany({ where: { termId } })
        }
        await tx.term.delete({ where: { id: termId } })
      })

      this.clearUserState(ctx)
      await ctx.reply(`تم حذف الفصل: ${term.name} (السنة: ${term.year.name})`)
      await this.showAdminPanel(ctx)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل حذف الفصل. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private async deleteCourse(ctx: any, yearId: number, termId: number, courseId: number) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: { term: { include: { year: true } } },
      })
      if (!course || course.termId !== termId || course.term.yearId !== yearId) {
        await ctx.reply('المادة غير موجودة في هذا الفصل.')
        await this.showCoursesForDeleteCourse(ctx, yearId, termId)
        return
      }

      await this.prisma.$transaction(async tx => {
        await tx.courseFile.deleteMany({ where: { courseId } })
        await tx.course.delete({ where: { id: courseId } })
      })

      this.clearUserState(ctx)
      await ctx.reply(
        `تم حذف المادة: ${course.name} (الفصل: ${course.term.name} - السنة: ${course.term.year.name})`,
      )
      await this.showAdminPanel(ctx)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل حذف المادة. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  // ─── Keyboards ──────────────────────────────────────────────────────────────
  private mainKeyboard(isAdmin: boolean) {
    const buttons: any[][] = [
      [Markup.button.text(BUTTONS.browse)],
      [Markup.button.text(BUTTONS.channelLink)],
    ]
    if (isAdmin) buttons.push([Markup.button.text(BUTTONS.admin)])
    return Markup.keyboard(buttons).resize()
  }

  private fileTypeKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.ftBank)],
      [Markup.button.text(BUTTONS.ftGolden)],
      [Markup.button.text(BUTTONS.ftCourses)],
      [Markup.button.text(BUTTONS.ftRecordings)],
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private adminKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.addYear), Markup.button.text(BUTTONS.addTerm)],
      [Markup.button.text(BUTTONS.addCourse), Markup.button.text(BUTTONS.addFile)],
      [Markup.button.text(BUTTONS.deleteFile), Markup.button.text(BUTTONS.deleteTerm)],
      [Markup.button.text(BUTTONS.deleteCourse)],
      [Markup.button.text(BUTTONS.addAdmin), Markup.button.text(BUTTONS.listAdmins)],
      [Markup.button.text(BUTTONS.removeAdmin), Markup.button.text(BUTTONS.stats)],
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private statsKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.userCount), Markup.button.text(BUTTONS.listUsers)],
      [Markup.button.text(BUTTONS.searchUser)],
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private cancelKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.cancel)],
      [Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private yearsKeyboard(years: Array<{ id: number; name: string }>) {
    const rows = years.map(y => [Markup.button.text(this.yearLabel(y.id, y.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private termsKeyboard(terms: Array<{ id: number; name: string }>) {
    const rows = terms.map(t => [Markup.button.text(this.termLabel(t.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private coursesKeyboard(courses: Array<{ id: number; name: string }>) {
    const rows = courses.map(c => [Markup.button.text(this.courseLabel(c.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private filesKeyboard(files: Array<{ id: number; name: string | null; fileType?: string }>) {
    const rows = files.map(f => [
      Markup.button.text(this.fileLabel(f.id, f.name, f.fileType as FileType | undefined)),
    ])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  // ─── Labels ─────────────────────────────────────────────────────────────────
  private yearLabel(id: number, name: string) { return `سنة: ${id} - ${name}` }
  private termLabel(name: string) { return name }
  private courseLabel(name: string) { return name }
  private fileLabel(id: number, name: string | null, fileType?: FileType) {
    const suffix = fileType ? ` [${FILE_TYPE_LABELS[fileType]}]` : ''
    return `ملف: ${id} - ${name ?? `ملف ${id}`}${suffix}`
  }

  private buildChoices(items: Array<{ id: number; name: string }>): Record<string, number> {
    return Object.fromEntries(items.map(item => [item.name, item.id]))
  }

  private resolveChoice(choices: Record<string, number> | undefined, text: string): number | null {
    if (!choices) return null
    return choices[text] ?? null
  }

  // ─── Parsers ────────────────────────────────────────────────────────────────
  private parseYearId(text: string): number | null {
    const match = text.match(/^سنة:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }
  private parseFileRowId(text: string): number | null {
    const match = text.match(/^ملف:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }

  // ─── State ──────────────────────────────────────────────────────────────────
  private getUserState(ctx: any): UserState {
    const userId = ctx.from?.id
    if (!userId) return { mode: 'idle' }
    return this.userStates.get(userId) ?? { mode: 'idle' }
  }
  private setUserState(ctx: any, state: UserState) {
    const userId = ctx.from?.id
    if (!userId) return
    this.userStates.set(userId, state)
  }
  private clearUserState(ctx: any) {
    const userId = ctx.from?.id
    if (!userId) return
    this.userStates.delete(userId)
  }
}