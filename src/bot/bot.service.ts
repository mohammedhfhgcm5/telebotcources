import { Injectable, OnModuleInit } from '@nestjs/common'
import { Markup, Telegraf } from 'telegraf'
import { PrismaService } from '../prisma/prisma.service'

// ─── Channel URL ─────────────────────────────────────────────────────────────
const CHANNEL_URL = 'https://t.me/+OsdxPe9fzUg0Y2M0'

// ─── Keep-alive ───────────────────────────────────────────────────────────────
const KEEP_ALIVE_URL = 'https://telebotcources.onrender.com/'

// ─── Buttons ──────────────────────────────────────────────────────────────────
const BUTTONS = {
  browse: '📚 تصفح الملفات',
  channelLink: '📢 رابط القناة الرئيسية',
  admin: '⚙️ لوحة الإدارة',

  // Education type
  generalEdu: '🏫 تعليم عام',
  openEdu: '🎓 تعليم مفتوح',

  // File types
  ftSummary: '📝 ملخص قلم حقوقي',
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
  addAdmin: '👤 إضافة أدمن',
  listAdmins: '📋 قائمة الأدمن',
  removeAdmin: '❌ حذف أدمن',
  back: '⬅️ رجوع',
  cancel: '❌ إلغاء',
  mainMenu: '🏠 القائمة الرئيسية',
} as const

// ─── Types ────────────────────────────────────────────────────────────────────
type EducationType = 'GENERAL' | 'OPEN'
type FileType = 'SUMMARY' | 'BANK' | 'GOLDEN' | 'COURSES' | 'RECORDINGS'

/**
 * Telegram media category – stored alongside fileId so we know
 * which reply method to use when sending the file back.
 */
type MediaKind = 'document' | 'audio' | 'voice'

const EDU_TYPE_LABELS: Record<EducationType, string> = {
  GENERAL: 'تعليم عام',
  OPEN: 'تعليم مفتوح',
}

const FILE_TYPE_LABELS: Record<FileType, string> = {
  SUMMARY: 'ملخص قلم حقوقي',
  BANK: 'بنك قلم حقوقي',
  GOLDEN: 'دهبية',
  COURSES: 'دورات',
  RECORDINGS: 'تسجيلات المادة',
}

const EDU_TYPE_BUTTONS: Record<string, EducationType> = {
  [BUTTONS.generalEdu]: 'GENERAL',
  [BUTTONS.openEdu]: 'OPEN',
}

const FILE_TYPE_BUTTONS: Record<string, FileType> = {
  [BUTTONS.ftSummary]: 'SUMMARY',
  [BUTTONS.ftBank]: 'BANK',
  [BUTTONS.ftGolden]: 'GOLDEN',
  [BUTTONS.ftCourses]: 'COURSES',
  [BUTTONS.ftRecordings]: 'RECORDINGS',
}

// ─── User state ───────────────────────────────────────────────────────────────
type UserState =
  | { mode: 'idle' }
  | { mode: 'browseYear' }
  | { mode: 'browseTerm'; yearId: number }
  | { mode: 'browseCourse'; yearId: number; termId: number }
  | { mode: 'browseEduType'; yearId: number; termId: number; courseId: number }
  | { mode: 'browseFileType'; yearId: number; termId: number; courseId: number; eduType: EducationType }
  | { mode: 'adminPanel' }
  | { mode: 'addYearName' }
  | { mode: 'addTermYear' }
  | { mode: 'addTermName'; yearId: number }
  | { mode: 'addCourseYear' }
  | { mode: 'addCourseTerm'; yearId: number }
  | { mode: 'addCourseName'; yearId: number; termId: number }
  | { mode: 'addFileYear' }
  | { mode: 'addFileTerm'; yearId: number }
  | { mode: 'addFileCourse'; yearId: number; termId: number }
  | { mode: 'addFileEduType'; yearId: number; termId: number; courseId: number }
  | { mode: 'addFileType'; yearId: number; termId: number; courseId: number; eduType: EducationType }
  | { mode: 'addFileUpload'; yearId: number; termId: number; courseId: number; eduType: EducationType; fileType: FileType }
  | { mode: 'deleteFileYear' }
  | { mode: 'deleteFileTerm'; yearId: number }
  | { mode: 'deleteFileCourse'; yearId: number; termId: number }
  | { mode: 'deleteFileFile'; yearId: number; termId: number; courseId: number }
  | { mode: 'addAdminId' }
  | { mode: 'removeAdminId' }

@Injectable()
export class BotService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  bot = new Telegraf(process.env.BOT_TOKEN!)
  private readonly userStates = new Map<number, UserState>()
  private keepAliveInterval: NodeJS.Timeout | null = null

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  async onModuleInit() {
    this.startKeepAlive()

    this.bot.start(async ctx => {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, 'أهلا بك في بوت الملفات. اختر العملية:')
    })

    this.bot.command('menu', async ctx => {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx)
    })

    this.bot.command('files', async ctx => {
      this.clearUserState(ctx)
      await this.showYearsForBrowse(ctx)
    })

    this.bot.on('text', async ctx => {
      await this.handleTextInput(ctx)
    })

    // ── Media handlers ──────────────────────────────────────────────────────
    this.bot.on('document', async ctx => {
      await this.handleMediaInput(ctx, 'document')
    })

    this.bot.on('audio', async ctx => {
      await this.handleMediaInput(ctx, 'audio')
    })

    this.bot.on('voice', async ctx => {
      await this.handleMediaInput(ctx, 'voice')
    })

    const appUrl = process.env.APP_URL
    if (!appUrl) throw new Error('APP_URL is required to set the Telegram webhook.')
    await this.bot.telegram.deleteWebhook()
    await this.bot.telegram.setWebhook(`${appUrl}/telegram`, { drop_pending_updates: true })
  }

  // ─── Keep-alive ─────────────────────────────────────────────────────────────
  private startKeepAlive() {
    this.pingServer()
    this.keepAliveInterval = setInterval(() => this.pingServer(), 60 * 60 * 1000)
  }

  private async pingServer() {
    try {
      const res = await fetch(KEEP_ALIVE_URL)
      console.log(`[Keep-alive] ${KEEP_ALIVE_URL} → ${res.status}`)
    } catch (err) {
      console.error('[Keep-alive] Ping failed:', err)
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
  private async showMainMenu(ctx: any, text = 'اختر العملية:') {
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

  // ─── Browse: Years ──────────────────────────────────────────────────────────
  private async showYearsForBrowse(ctx: any, text = 'اختر السنة:') {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
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
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) {
        await this.showYearsForBrowse(ctx, 'لا توجد فصول في هذه السنة. اختر سنة أخرى:')
        return
      }
      this.setUserState(ctx, { mode: 'browseTerm', yearId })
      await ctx.reply('اختر الفصل:', this.termsKeyboard(terms))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب الفصول.')
    }
  }

  // ─── Browse: Courses ────────────────────────────────────────────────────────
  private async showCoursesForBrowse(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { name: 'asc' } })
      if (courses.length === 0) {
        await this.showTermsForBrowse(ctx, yearId)
        return
      }
      this.setUserState(ctx, { mode: 'browseCourse', yearId, termId })
      await ctx.reply('اختر المادة:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب المواد.')
    }
  }

  // ─── Browse: Edu type ───────────────────────────────────────────────────────
  private async showEduTypeForBrowse(ctx: any, yearId: number, termId: number, courseId: number) {
    this.setUserState(ctx, { mode: 'browseEduType', yearId, termId, courseId })
    await ctx.reply('اختر نوع التعليم:', this.eduTypeKeyboard())
  }

  // ─── Browse: File type ──────────────────────────────────────────────────────
  private async showFileTypeForBrowse(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
    eduType: EducationType,
  ) {
    this.setUserState(ctx, { mode: 'browseFileType', yearId, termId, courseId, eduType })
    await ctx.reply(
      `نوع التعليم: ${EDU_TYPE_LABELS[eduType]}\nاختر نوع الملف:`,
      this.fileTypeKeyboard(),
    )
  }

  // ─── Browse: Files ──────────────────────────────────────────────────────────
  private async showFilesForBrowse(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
    eduType: EducationType,
    fileType: FileType,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: {
          files: {
            where: { educationType: eduType, fileType },
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
          `لا توجد ملفات من نوع "${FILE_TYPE_LABELS[fileType]}" لـ${EDU_TYPE_LABELS[eduType]} في هذه المادة.`,
        )
        await this.showFileTypeForBrowse(ctx, yearId, termId, courseId, eduType)
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

  /**
   * Send a stored file using the correct Telegram method based on mediaKind.
   * Falls back to replyWithDocument if mediaKind is missing (old records).
   */
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
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addTermYear' })
      await ctx.reply('اختر السنة لإضافة فصل:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: Years/Terms for add course ─────────────────────────────────────
  private async showYearsForAddCourse(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addCourseYear' })
      await ctx.reply('اختر السنة لإضافة مادة:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForAddCourse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addCourseTerm', yearId })
      await ctx.reply('اختر الفصل لإضافة مادة:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  // ─── Admin: add file – navigation ──────────────────────────────────────────
  private async showYearsForAddFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addFileYear' })
      await ctx.reply('اختر السنة لإضافة ملف:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForAddFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addFileTerm', yearId })
      await ctx.reply('اختر الفصل لإضافة ملف:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showCoursesForAddFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { name: 'asc' } })
      if (courses.length === 0) { await ctx.reply('لا توجد مواد في هذا الفصل. أضف مادة أولا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'addFileCourse', yearId, termId })
      await ctx.reply('اختر المادة لإضافة ملف:', this.coursesKeyboard(courses))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showEduTypeForAddFile(ctx: any, yearId: number, termId: number, courseId: number) {
    this.setUserState(ctx, { mode: 'addFileEduType', yearId, termId, courseId })
    await ctx.reply('اختر نوع التعليم للملف:', this.eduTypeKeyboard())
  }

  private async showFileTypeForAddFile(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
    eduType: EducationType,
  ) {
    this.setUserState(ctx, { mode: 'addFileType', yearId, termId, courseId, eduType })
    await ctx.reply(`نوع التعليم: ${EDU_TYPE_LABELS[eduType]}\nاختر نوع الملف:`, this.fileTypeKeyboard())
  }

  // ─── Admin: delete file – navigation ───────────────────────────────────────
  private async showYearsForDeleteFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) { await ctx.reply('لا توجد سنوات حاليا.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteFileYear' })
      await ctx.reply('اختر السنة لحذف ملف:', this.yearsKeyboard(years))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showTermsForDeleteFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) { await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteFileTerm', yearId })
      await ctx.reply('اختر الفصل لحذف ملف:', this.termsKeyboard(terms))
    } catch (error) { console.error(error); await ctx.reply('حدث خطأ.', this.adminKeyboard()) }
  }

  private async showCoursesForDeleteFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { name: 'asc' } })
      if (courses.length === 0) { await ctx.reply('لا توجد مواد في هذا الفصل.', this.adminKeyboard()); return }
      this.setUserState(ctx, { mode: 'deleteFileCourse', yearId, termId })
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
    const text = ctx.message?.text?.trim()
    const userId = ctx.from?.id
    if (!text) return

    if (text === BUTTONS.mainMenu) { this.clearUserState(ctx); await this.showMainMenu(ctx); return }
    if (text === BUTTONS.cancel) { this.clearUserState(ctx); await this.showMainMenu(ctx, 'تم الإلغاء.'); return }

    const state = this.getUserState(ctx)

    if (state.mode === 'idle') { await this.handleMainMenuButtons(ctx, text); return }
    if (state.mode === 'adminPanel') { await this.handleAdminPanelButtons(ctx, text); return }

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
      const termId = this.parseTermId(text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForBrowse(ctx, state.yearId, termId)
      return
    }

    // ── Browse: course ──
    if (state.mode === 'browseCourse') {
      if (text === BUTTONS.back) { await this.showTermsForBrowse(ctx, state.yearId); return }
      const courseId = this.parseCourseId(text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      await this.showEduTypeForBrowse(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Browse: edu type ──
    if (state.mode === 'browseEduType') {
      if (text === BUTTONS.back) { await this.showCoursesForBrowse(ctx, state.yearId, state.termId); return }
      const eduType = EDU_TYPE_BUTTONS[text]
      if (!eduType) { await ctx.reply('اختر نوع التعليم من الأزرار.'); return }
      await this.showFileTypeForBrowse(ctx, state.yearId, state.termId, state.courseId, eduType)
      return
    }

    // ── Browse: file type ──
    if (state.mode === 'browseFileType') {
      if (text === BUTTONS.back) {
        await this.showEduTypeForBrowse(ctx, state.yearId, state.termId, state.courseId)
        return
      }
      const fileType = FILE_TYPE_BUTTONS[text]
      if (!fileType) { await ctx.reply('اختر نوع الملف من الأزرار.'); return }
      await this.showFilesForBrowse(ctx, state.yearId, state.termId, state.courseId, state.eduType, fileType)
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
      const termId = this.parseTermId(text)
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
      const termId = this.parseTermId(text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForAddFile(ctx, state.yearId, termId)
      return
    }

    // ── Add file: course ──
    if (state.mode === 'addFileCourse') {
      if (text === BUTTONS.back) { await this.showTermsForAddFile(ctx, state.yearId); return }
      const courseId = this.parseCourseId(text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      await this.showEduTypeForAddFile(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Add file: edu type ──
    if (state.mode === 'addFileEduType') {
      if (text === BUTTONS.back) { await this.showCoursesForAddFile(ctx, state.yearId, state.termId); return }
      const eduType = EDU_TYPE_BUTTONS[text]
      if (!eduType) { await ctx.reply('اختر نوع التعليم من الأزرار.'); return }
      await this.showFileTypeForAddFile(ctx, state.yearId, state.termId, state.courseId, eduType)
      return
    }

    // ── Add file: file type ──
    if (state.mode === 'addFileType') {
      if (text === BUTTONS.back) {
        await this.showEduTypeForAddFile(ctx, state.yearId, state.termId, state.courseId)
        return
      }
      const fileType = FILE_TYPE_BUTTONS[text]
      if (!fileType) { await ctx.reply('اختر نوع الملف من الأزرار.'); return }
      this.setUserState(ctx, {
        mode: 'addFileUpload',
        yearId: state.yearId,
        termId: state.termId,
        courseId: state.courseId,
        eduType: state.eduType,
        fileType,
      })
      await ctx.reply(
        `نوع التعليم: ${EDU_TYPE_LABELS[state.eduType]}\nنوع الملف: ${FILE_TYPE_LABELS[fileType]}\n\nأرسل الملف (document / audio / voice) أو أرسل file_id كنص:`,
        this.cancelKeyboard(),
      )
      return
    }

    // ── Add file: upload (text = file_id) ──
    if (state.mode === 'addFileUpload') {
      if (text === BUTTONS.back) {
        await this.showFileTypeForAddFile(ctx, state.yearId, state.termId, state.courseId, state.eduType)
        return
      }
      // Treat plain text as a raw file_id (document fallback)
      await this.createCourseFile(
        ctx,
        state.courseId,
        state.termId,
        text,
        undefined,
        state.eduType,
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
      const termId = this.parseTermId(text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForDeleteFile(ctx, state.yearId, termId)
      return
    }

    // ── Delete file: course ──
    if (state.mode === 'deleteFileCourse') {
      if (text === BUTTONS.back) { await this.showTermsForDeleteFile(ctx, state.yearId); return }
      const courseId = this.parseCourseId(text)
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
    }
  }

  // ─── Unified media handler (document / audio / voice) ──────────────────────
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
      // Voice messages have no filename; leave undefined
    }

    if (!fileId) { await ctx.reply('الملف غير صالح.'); return }

    await this.createCourseFile(
      ctx,
      state.courseId,
      state.termId,
      fileId,
      fileName,
      state.eduType,
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
    await this.showAdminPanel(ctx)
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
    eduType: EducationType = 'GENERAL',
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
          educationType: eduType,
          fileType,
          mediaKind,           // ← new field
        },
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
        `نوع التعليم: ${EDU_TYPE_LABELS[eduType]}\n` +
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

  // ─── Keyboards ──────────────────────────────────────────────────────────────
  private mainKeyboard(isAdmin: boolean) {
    const buttons: any[][] = [
      [Markup.button.text(BUTTONS.browse)],
      [Markup.button.text(BUTTONS.channelLink)],
    ]
    if (isAdmin) buttons.push([Markup.button.text(BUTTONS.admin)])
    return Markup.keyboard(buttons).resize()
  }

  private eduTypeKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.generalEdu), Markup.button.text(BUTTONS.openEdu)],
      [Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)],
    ]).resize()
  }

  private fileTypeKeyboard() {
    return Markup.keyboard([
      [Markup.button.text(BUTTONS.ftSummary)],
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
      [Markup.button.text(BUTTONS.deleteFile)],
      [Markup.button.text(BUTTONS.addAdmin), Markup.button.text(BUTTONS.listAdmins)],
      [Markup.button.text(BUTTONS.removeAdmin)],
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
    const rows = terms.map(t => [Markup.button.text(this.termLabel(t.id, t.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private coursesKeyboard(courses: Array<{ id: number; name: string }>) {
    const rows = courses.map(c => [Markup.button.text(this.courseLabel(c.id, c.name))])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  private filesKeyboard(files: Array<{ id: number; name: string | null; fileType?: string; educationType?: string }>) {
    const rows = files.map(f => [
      Markup.button.text(this.fileLabel(f.id, f.name, f.fileType as FileType | undefined, f.educationType as EducationType | undefined)),
    ])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  // ─── Labels ─────────────────────────────────────────────────────────────────
  private yearLabel(id: number, name: string) { return `سنة: ${id} - ${name}` }
  private termLabel(id: number, name: string) { return `فصل: ${id} - ${name}` }
  private courseLabel(id: number, name: string) { return `مادة: ${id} - ${name}` }
  private fileLabel(id: number, name: string | null, fileType?: FileType, eduType?: EducationType) {
    const parts: string[] = []
    if (eduType) parts.push(EDU_TYPE_LABELS[eduType])
    if (fileType) parts.push(FILE_TYPE_LABELS[fileType])
    const suffix = parts.length ? ` [${parts.join(' - ')}]` : ''
    return `ملف: ${id} - ${name ?? `ملف ${id}`}${suffix}`
  }

  // ─── Parsers ────────────────────────────────────────────────────────────────
  private parseYearId(text: string): number | null {
    const match = text.match(/^سنة:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }
  private parseTermId(text: string): number | null {
    const match = text.match(/^فصل:\s*(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }
  private parseCourseId(text: string): number | null {
    const match = text.match(/^مادة:\s*(\d+)\s*-/)
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