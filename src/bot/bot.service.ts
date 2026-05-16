import { Injectable, OnModuleInit } from '@nestjs/common'
import { Markup, Telegraf } from 'telegraf'
import { PrismaService } from '../prisma/prisma.service'

// ─── Channel URL ────────────────────────────────────────────────────────────
const CHANNEL_URL = 'https://t.me/HT3n3DPJ0iw4N2Nk'

// ─── Keep-alive server URL ───────────────────────────────────────────────────
const KEEP_ALIVE_URL = 'https://telebotcources.onrender.com/'

// ─── Buttons ─────────────────────────────────────────────────────────────────
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

// ─── Education type helpers ───────────────────────────────────────────────────
type EducationType = 'GENERAL' | 'OPEN'
type FileType = 'SUMMARY' | 'BANK' | 'GOLDEN' | 'COURSES' | 'RECORDINGS'

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

const FILE_TYPE_BUTTONS: Record<string, FileType> = {
  [BUTTONS.ftSummary]: 'SUMMARY',
  [BUTTONS.ftBank]: 'BANK',
  [BUTTONS.ftGolden]: 'GOLDEN',
  [BUTTONS.ftCourses]: 'COURSES',
  [BUTTONS.ftRecordings]: 'RECORDINGS',
}

const ALL_FILE_TYPE_BUTTONS = Object.keys(FILE_TYPE_BUTTONS)

// ─── User state ───────────────────────────────────────────────────────────────
type UserState =
  | { mode: 'idle' }
  | { mode: 'browseEduType' }
  | { mode: 'browseYear'; eduType: EducationType }
  | { mode: 'browseTerm'; eduType: EducationType; yearId: number }
  | { mode: 'browseCourse'; eduType: EducationType; yearId: number; termId: number }
  | { mode: 'browseFileType'; eduType: EducationType; yearId: number; termId: number; courseId: number }
  | { mode: 'adminPanel' }
  | { mode: 'addYearEduType' }
  | { mode: 'addYearName'; eduType: EducationType }
  | { mode: 'addTermYear' }
  | { mode: 'addTermName'; yearId: number }
  | { mode: 'addCourseYear' }
  | { mode: 'addCourseTerm'; yearId: number }
  | { mode: 'addCourseName'; yearId: number; termId: number }
  | { mode: 'addFileYear' }
  | { mode: 'addFileTerm'; yearId: number }
  | { mode: 'addFileCourse'; yearId: number; termId: number }
  | { mode: 'addFileType'; yearId: number; termId: number; courseId: number }
  | { mode: 'addFileUpload'; yearId: number; termId: number; courseId: number; fileType: FileType }
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

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
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
      await this.showEduTypeSelection(ctx)
    })

    this.bot.on('text', async ctx => {
      await this.handleTextInput(ctx)
    })

    this.bot.on('document', async ctx => {
      await this.handleDocumentInput(ctx)
    })

    const appUrl = process.env.APP_URL
    if (!appUrl) {
      throw new Error('APP_URL is required to set the Telegram webhook.')
    }
    await this.bot.telegram.deleteWebhook()
    await this.bot.telegram.setWebhook(`${appUrl}/telegram`, {
      drop_pending_updates: true,
    })
  }

  // ─── Keep-alive ────────────────────────────────────────────────────────────
  private startKeepAlive() {
    // Ping immediately on start
    this.pingServer()

    // Then ping every 1 hour (3,600,000 ms)
    this.keepAliveInterval = setInterval(() => {
      this.pingServer()
    }, 60 * 60 * 1000)
  }

  private async pingServer() {
    try {
      const res = await fetch(KEEP_ALIVE_URL)
      console.log(`[Keep-alive] Pinged ${KEEP_ALIVE_URL} → ${res.status}`)
    } catch (err) {
      console.error('[Keep-alive] Ping failed:', err)
    }
  }

  // ─── Admin check ───────────────────────────────────────────────────────────
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

  // ─── Main menu ─────────────────────────────────────────────────────────────
  private async showMainMenu(ctx: any, text = 'اختر العملية:') {
    this.setUserState(ctx, { mode: 'idle' })
    const userId = ctx.from?.id
    const admin = userId ? await this.isAdmin(userId) : false
    await ctx.reply(text, this.mainKeyboard(admin))
  }

  // ─── Admin panel ───────────────────────────────────────────────────────────
  private async showAdminPanel(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return
    this.setUserState(ctx, { mode: 'adminPanel' })
    await ctx.reply('لوحة الإدارة:', this.adminKeyboard())
  }

  // ─── Browse: Education type ────────────────────────────────────────────────
  private async showEduTypeSelection(ctx: any, text = 'اختر نوع التعليم:') {
    this.setUserState(ctx, { mode: 'browseEduType' })
    await ctx.reply(text, this.eduTypeKeyboard())
  }

  // ─── Browse: Years ─────────────────────────────────────────────────────────
  private async showYearsForBrowse(ctx: any, eduType: EducationType, text = 'اختر السنة:') {
    try {
      const years = await this.prisma.year.findMany({
        where: { educationType: eduType },
        orderBy: { name: 'asc' },
      })

      if (years.length === 0) {
        await this.showEduTypeSelection(ctx, 'لا توجد سنوات لهذا النوع. اختر نوع تعليم آخر:')
        return
      }

      this.setUserState(ctx, { mode: 'browseYear', eduType })
      await ctx.reply(text, this.yearsKeyboard(years))
    } catch (error) {
      console.error('Error fetching years:', error)
      await ctx.reply('حدث خطأ في جلب السنوات.')
    }
  }

  // ─── Browse: Terms ─────────────────────────────────────────────────────────
  private async showTermsForBrowse(ctx: any, eduType: EducationType, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({
        where: { yearId },
        orderBy: { name: 'asc' },
      })

      if (terms.length === 0) {
        await this.showYearsForBrowse(ctx, eduType, 'لا توجد فصول في هذه السنة. اختر سنة أخرى:')
        return
      }

      this.setUserState(ctx, { mode: 'browseTerm', eduType, yearId })
      await ctx.reply('اختر الفصل:', this.termsKeyboard(terms))
    } catch (error) {
      console.error('Error fetching terms:', error)
      await ctx.reply('حدث خطأ في جلب الفصول.')
    }
  }

  // ─── Browse: Courses ───────────────────────────────────────────────────────
  private async showCoursesForBrowse(
    ctx: any,
    eduType: EducationType,
    yearId: number,
    termId: number,
  ) {
    try {
      const courses = await this.prisma.course.findMany({
        where: { termId },
        orderBy: { name: 'asc' },
      })

      if (courses.length === 0) {
        await this.showTermsForBrowse(ctx, eduType, yearId)
        return
      }

      this.setUserState(ctx, { mode: 'browseCourse', eduType, yearId, termId })
      await ctx.reply('اختر المادة:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error('Error fetching courses:', error)
      await ctx.reply('حدث خطأ في جلب المواد.')
    }
  }

  // ─── Browse: File type selection ───────────────────────────────────────────
  private async showFileTypeSelection(
    ctx: any,
    eduType: EducationType,
    yearId: number,
    termId: number,
    courseId: number,
  ) {
    this.setUserState(ctx, { mode: 'browseFileType', eduType, yearId, termId, courseId })
    await ctx.reply('اختر نوع الملف:', this.fileTypeKeyboard())
  }

  // ─── Browse: Files by type ─────────────────────────────────────────────────
  private async showFilesForBrowse(
    ctx: any,
    eduType: EducationType,
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
            where: { fileType },
            orderBy: { id: 'desc' },
          },
        },
      })

      if (!course || course.termId !== termId) {
        await this.showCoursesForBrowse(ctx, eduType, yearId, termId)
        return
      }

      if (course.files.length === 0) {
        await ctx.reply(`لا توجد ملفات من نوع "${FILE_TYPE_LABELS[fileType]}" لهذه المادة.`)
        await this.showFileTypeSelection(ctx, eduType, yearId, termId, courseId)
        return
      }

      for (const file of course.files) {
        try {
          await ctx.replyWithDocument(file.fileId, {
            caption: file.name ?? `${course.name} - ${FILE_TYPE_LABELS[fileType]}`,
          })
        } catch {
          await ctx.reply(`تعذر إرسال الملف: ${file.name ?? `#${file.id}`}`)
        }
      }

      await this.showYearsForBrowse(ctx, eduType, 'تم إرسال الملفات. اختر السنة:')
    } catch (error) {
      console.error('Error fetching files:', error)
      await ctx.reply('حدث خطأ في جلب الملفات.')
    }
  }

  // ─── Admin: Add year (step 1 - edu type) ──────────────────────────────────
  private async showEduTypeForAddYear(ctx: any) {
    this.setUserState(ctx, { mode: 'addYearEduType' })
    await ctx.reply('اختر نوع التعليم للسنة الجديدة:', this.eduTypeKeyboard())
  }

  // ─── Admin: Years for add term ─────────────────────────────────────────────
  private async showYearsForAddTerm(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'addTermYear' })
      await ctx.reply('اختر السنة لإضافة فصل:', this.yearsKeyboard(years))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  // ─── Admin: Years for add course ──────────────────────────────────────────
  private async showYearsForAddCourse(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'addCourseYear' })
      await ctx.reply('اختر السنة لإضافة مادة:', this.yearsKeyboard(years))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showTermsForAddCourse(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) {
        await ctx.reply('لا توجد فصول في هذه السنة. أضف فصل أولا.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'addCourseTerm', yearId })
      await ctx.reply('اختر الفصل لإضافة مادة:', this.termsKeyboard(terms))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  // ─── Admin: Years/Terms/Courses for add file ──────────────────────────────
  private async showYearsForAddFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات. أضف سنة أولا.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'addFileYear' })
      await ctx.reply('اختر السنة لإضافة ملف:', this.yearsKeyboard(years))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showTermsForAddFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) {
        await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'addFileTerm', yearId })
      await ctx.reply('اختر الفصل لإضافة ملف:', this.termsKeyboard(terms))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showCoursesForAddFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { name: 'asc' } })
      if (courses.length === 0) {
        await ctx.reply('لا توجد مواد في هذا الفصل. أضف مادة أولا.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'addFileCourse', yearId, termId })
      await ctx.reply('اختر المادة لإضافة ملف:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showFileTypeForAddFile(ctx: any, yearId: number, termId: number, courseId: number) {
    this.setUserState(ctx, { mode: 'addFileType', yearId, termId, courseId })
    await ctx.reply('اختر نوع الملف:', this.fileTypeKeyboard())
  }

  // ─── Admin: Years/Terms/Courses/Files for delete ──────────────────────────
  private async showYearsForDeleteFile(ctx: any) {
    try {
      const years = await this.prisma.year.findMany({ orderBy: { name: 'asc' } })
      if (years.length === 0) {
        await ctx.reply('لا توجد سنوات حاليا.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'deleteFileYear' })
      await ctx.reply('اختر السنة لحذف ملف:', this.yearsKeyboard(years))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showTermsForDeleteFile(ctx: any, yearId: number) {
    try {
      const terms = await this.prisma.term.findMany({ where: { yearId }, orderBy: { name: 'asc' } })
      if (terms.length === 0) {
        await ctx.reply('لا توجد فصول في هذه السنة.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'deleteFileTerm', yearId })
      await ctx.reply('اختر الفصل لحذف ملف:', this.termsKeyboard(terms))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showCoursesForDeleteFile(ctx: any, yearId: number, termId: number) {
    try {
      const courses = await this.prisma.course.findMany({ where: { termId }, orderBy: { name: 'asc' } })
      if (courses.length === 0) {
        await ctx.reply('لا توجد مواد في هذا الفصل.', this.adminKeyboard())
        return
      }
      this.setUserState(ctx, { mode: 'deleteFileCourse', yearId, termId })
      await ctx.reply('اختر المادة لحذف ملف منها:', this.coursesKeyboard(courses))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  private async showFilesForDeleteFile(
    ctx: any,
    yearId: number,
    termId: number,
    courseId: number,
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        include: { files: { orderBy: { id: 'desc' } } },
      })

      if (!course || course.termId !== termId) {
        await this.showCoursesForDeleteFile(ctx, yearId, termId)
        return
      }

      if (course.files.length === 0) {
        await ctx.reply('لا توجد ملفات لهذه المادة.', this.adminKeyboard())
        await this.showCoursesForDeleteFile(ctx, yearId, termId)
        return
      }

      this.setUserState(ctx, { mode: 'deleteFileFile', yearId, termId, courseId })
      await ctx.reply('اختر الملف المراد حذفه:', this.filesKeyboard(course.files))
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ.', this.adminKeyboard())
    }
  }

  // ─── Admin: List admins ────────────────────────────────────────────────────
  private async listAdmins(ctx: any) {
    try {
      const admins = await this.prisma.admin.findMany({ orderBy: { id: 'asc' } })
      if (admins.length === 0) {
        await ctx.reply('لا يوجد أدمن في النظام.', this.adminKeyboard())
        return
      }
      const list = admins.map(a => `• ${a.id.toString()}`).join('\n')
      await ctx.reply(`قائمة الأدمن:\n${list}`, this.adminKeyboard())
    } catch (error) {
      console.error(error)
      await ctx.reply('حدث خطأ في جلب قائمة الأدمن.', this.adminKeyboard())
    }
  }

  // ─── Text handler ──────────────────────────────────────────────────────────
  private async handleTextInput(ctx: any) {
    const text = ctx.message?.text?.trim()
    const userId = ctx.from?.id
    if (!text) return

    // Global buttons
    if (text === BUTTONS.mainMenu) {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx)
      return
    }
    if (text === BUTTONS.cancel) {
      this.clearUserState(ctx)
      await this.showMainMenu(ctx, 'تم الإلغاء.')
      return
    }

    const state = this.getUserState(ctx)

    // ── Idle ──
    if (state.mode === 'idle') {
      await this.handleMainMenuButtons(ctx, text)
      return
    }

    // ── Admin panel ──
    if (state.mode === 'adminPanel') {
      await this.handleAdminPanelButtons(ctx, text)
      return
    }

    // ── Browse: edu type ──
    if (state.mode === 'browseEduType') {
      if (text === BUTTONS.back) { await this.showMainMenu(ctx); return }
      if (text === BUTTONS.generalEdu) { await this.showYearsForBrowse(ctx, 'GENERAL'); return }
      if (text === BUTTONS.openEdu) { await this.showYearsForBrowse(ctx, 'OPEN'); return }
      await ctx.reply('اختر نوع التعليم من الأزرار.')
      return
    }

    // ── Browse: year ──
    if (state.mode === 'browseYear') {
      if (text === BUTTONS.back) { await this.showEduTypeSelection(ctx); return }
      const yearId = this.parseYearId(text)
      if (!yearId) { await ctx.reply('اختر سنة من الأزرار.'); return }
      await this.showTermsForBrowse(ctx, state.eduType, yearId)
      return
    }

    // ── Browse: term ──
    if (state.mode === 'browseTerm') {
      if (text === BUTTONS.back) { await this.showYearsForBrowse(ctx, state.eduType); return }
      const termId = this.parseTermId(text)
      if (!termId) { await ctx.reply('اختر فصل من الأزرار.'); return }
      await this.showCoursesForBrowse(ctx, state.eduType, state.yearId, termId)
      return
    }

    // ── Browse: course ──
    if (state.mode === 'browseCourse') {
      if (text === BUTTONS.back) { await this.showTermsForBrowse(ctx, state.eduType, state.yearId); return }
      const courseId = this.parseCourseId(text)
      if (!courseId) { await ctx.reply('اختر مادة من الأزرار.'); return }
      await this.showFileTypeSelection(ctx, state.eduType, state.yearId, state.termId, courseId)
      return
    }

    // ── Browse: file type ──
    if (state.mode === 'browseFileType') {
      if (text === BUTTONS.back) {
        await this.showCoursesForBrowse(ctx, state.eduType, state.yearId, state.termId)
        return
      }
      const fileType = FILE_TYPE_BUTTONS[text]
      if (!fileType) { await ctx.reply('اختر نوع الملف من الأزرار.'); return }
      await this.showFilesForBrowse(ctx, state.eduType, state.yearId, state.termId, state.courseId, fileType)
      return
    }

    // ── Admin-only states ──
    if (!(await this.ensureAdminAccess(ctx, userId))) return

    // ── Add year: edu type ──
    if (state.mode === 'addYearEduType') {
      if (text === BUTTONS.back) { await this.showAdminPanel(ctx); return }
      if (text === BUTTONS.generalEdu) {
        this.setUserState(ctx, { mode: 'addYearName', eduType: 'GENERAL' })
        await ctx.reply('أرسل اسم السنة الجديدة (تعليم عام):', this.cancelKeyboard())
        return
      }
      if (text === BUTTONS.openEdu) {
        this.setUserState(ctx, { mode: 'addYearName', eduType: 'OPEN' })
        await ctx.reply('أرسل اسم السنة الجديدة (تعليم مفتوح):', this.cancelKeyboard())
        return
      }
      await ctx.reply('اختر نوع التعليم من الأزرار.')
      return
    }

    // ── Add year: name ──
    if (state.mode === 'addYearName') {
      if (text === BUTTONS.back) { await this.showEduTypeForAddYear(ctx); return }
      await this.createYear(ctx, text, state.eduType)
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
      await this.showFileTypeForAddFile(ctx, state.yearId, state.termId, courseId)
      return
    }

    // ── Add file: type ──
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
        `نوع الملف: ${FILE_TYPE_LABELS[fileType]}\nأرسل الملف (Document) أو أرسل file_id كنص:`,
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
      await this.createCourseFile(ctx, state.courseId, state.termId, text, undefined, state.fileType)
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
      if (text === BUTTONS.back) {
        await this.showCoursesForDeleteFile(ctx, state.yearId, state.termId)
        return
      }
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

  // ─── Document handler ──────────────────────────────────────────────────────
  private async handleDocumentInput(ctx: any) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return

    const state = this.getUserState(ctx)
    if (state.mode !== 'addFileUpload') return

    const fileId = ctx.message?.document?.file_id
    if (!fileId) {
      await ctx.reply('الملف غير صالح. أرسل ملف صحيح.')
      return
    }

    const fileName = ctx.message?.document?.file_name ?? undefined
    await this.createCourseFile(ctx, state.courseId, state.termId, fileId, fileName, state.fileType)
  }

  // ─── Main menu buttons ─────────────────────────────────────────────────────
  private async handleMainMenuButtons(ctx: any, text: string) {
    if (text === BUTTONS.browse) {
      await this.showEduTypeSelection(ctx)
      return
    }
    if (text === BUTTONS.channelLink) {
      await ctx.reply(`📢 رابط القناة الرئيسية:\n${CHANNEL_URL}`)
      return
    }
    if (text === BUTTONS.admin) {
      await this.showAdminPanel(ctx)
      return
    }
    await this.showMainMenu(ctx, 'اختر خيارا من الأزرار.')
  }

  // ─── Admin panel buttons ───────────────────────────────────────────────────
  private async handleAdminPanelButtons(ctx: any, text: string) {
    const userId = ctx.from?.id
    if (!(await this.ensureAdminAccess(ctx, userId))) return

    if (text === BUTTONS.back) { await this.showMainMenu(ctx); return }
    if (text === BUTTONS.addYear) { await this.showEduTypeForAddYear(ctx); return }
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

  // ─── CRUD helpers ──────────────────────────────────────────────────────────
  private parseBigIntValue(value: string): bigint | null {
    try {
      if (!/^\d+$/.test(value)) return null
      return BigInt(value)
    } catch {
      return null
    }
  }

  private async addAdmin(ctx: any, adminIdText: string) {
    const adminId = this.parseBigIntValue(adminIdText)
    if (adminId === null) { await ctx.reply('ID غير صحيح. أرسل رقم صحيح.'); return }
    try {
      await this.prisma.admin.create({ data: { id: adminId } })
      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة الأدمن: ${adminId.toString()}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error(error)
      await ctx.reply('فشل إضافة الأدمن. قد يكون موجود بالفعل.')
    }
  }

  private async removeAdmin(ctx: any, adminIdText: string) {
    const adminId = this.parseBigIntValue(adminIdText)
    if (adminId === null) { await ctx.reply('ID غير صحيح. أرسل رقم صحيح.'); return }
    const userId = ctx.from?.id
    if (userId && adminId === BigInt(userId)) { await ctx.reply('لا يمكنك حذف نفسك!'); return }
    try {
      await this.prisma.admin.delete({ where: { id: adminId } })
      this.clearUserState(ctx)
      await ctx.reply(`تم حذف الأدمن: ${adminId.toString()}`)
      await this.showAdminPanel(ctx)
    } catch (error) {
      console.error(error)
      await ctx.reply('فشل حذف الأدمن. قد يكون غير موجود.')
    }
  }

  private async createYear(ctx: any, name: string, eduType: EducationType) {
    try {
      const created = await this.prisma.year.create({
        data: { name, educationType: eduType },
      })
      this.clearUserState(ctx)
      await ctx.reply(
        `تمت إضافة السنة: ${name} (ID: ${created.id}) - ${EDU_TYPE_LABELS[eduType]}`,
      )
      await this.showAdminPanel(ctx)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل إضافة السنة. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private async createTerm(ctx: any, yearId: number, name: string) {
    try {
      const year = await this.prisma.year.findUnique({ where: { id: yearId } })
      if (!year) {
        await ctx.reply('السنة غير موجودة.')
        await this.showYearsForAddTerm(ctx)
        return
      }
      const created = await this.prisma.term.create({ data: { name, yearId } })
      this.clearUserState(ctx)
      await ctx.reply(`تمت إضافة الفصل: ${name} (ID: ${created.id}) للسنة: ${year.name}`)
      await this.showAdminPanel(ctx)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل إضافة الفصل. الخطأ: ${error.message || 'قد يكون مكرر'}`)
    }
  }

  private async createCourse(ctx: any, termId: number, name: string) {
    try {
      const term = await this.prisma.term.findUnique({
        where: { id: termId },
        include: { year: true },
      })
      if (!term) { await ctx.reply('الفصل غير موجود.'); return }
      const created = await this.prisma.course.create({ data: { name, termId } })
      this.clearUserState(ctx)
      await ctx.reply(
        `تمت إضافة المادة: ${name} (ID: ${created.id}) للفصل: ${term.name} - السنة: ${term.year.name}`,
      )
      await this.showAdminPanel(ctx)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل إضافة المادة. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  private async createCourseFile(
    ctx: any,
    courseId: number,
    termId: number,
    fileId: string,
    name?: string,
    fileType: FileType = 'SUMMARY',
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
          fileType,
        },
      })
      this.clearUserState(ctx)
      await ctx.reply(
        `تمت إضافة ملف جديد (ID: ${created.id})\nالنوع: ${FILE_TYPE_LABELS[fileType]}\nالمادة: ${course.name}`,
      )
      await this.showAdminPanel(ctx)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل إضافة الملف. الخطأ: ${error.message || 'غير معروف'}`)
    }
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
      if (!file || file.courseId !== courseId) {
        await ctx.reply('الملف غير موجود في هذه المادة.')
        return
      }
      await this.prisma.courseFile.delete({ where: { id: fileRowId } })
      await ctx.reply(`تم حذف الملف: ${file.name ?? `#${file.id}`}`)
      await this.showFilesForDeleteFile(ctx, yearId, termId, courseId)
    } catch (error: any) {
      console.error(error)
      await ctx.reply(`فشل حذف الملف. الخطأ: ${error.message || 'غير معروف'}`)
    }
  }

  // ─── Keyboards ─────────────────────────────────────────────────────────────
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

  private yearsKeyboard(years: Array<{ id: number; name: string; educationType?: string }>) {
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

  private filesKeyboard(files: Array<{ id: number; name: string | null; fileType?: string }>) {
    const rows = files.map(f => [
      Markup.button.text(this.fileLabel(f.id, f.name, f.fileType as FileType | undefined)),
    ])
    rows.push([Markup.button.text(BUTTONS.back), Markup.button.text(BUTTONS.mainMenu)])
    return Markup.keyboard(rows).resize()
  }

  // ─── Label helpers ─────────────────────────────────────────────────────────
  private yearLabel(id: number, name: string) {
    return `سنة: ${id} - ${name}`
  }

  private termLabel(id: number, name: string) {
    return `فصل: ${id} - ${name}`
  }

  private courseLabel(id: number, name: string) {
    return `مادة: ${id} - ${name}`
  }

  private fileLabel(id: number, name: string | null, fileType?: FileType) {
    const typePart = fileType ? ` [${FILE_TYPE_LABELS[fileType]}]` : ''
    return `ملف: ${id} - ${name ?? `ملف ${id}`}${typePart}`
  }

  // ─── Parse helpers ─────────────────────────────────────────────────────────
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

  // ─── State helpers ─────────────────────────────────────────────────────────
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