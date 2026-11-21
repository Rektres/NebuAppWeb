# -*- coding: utf-8 -*-
"""
Generador de PDF de Bienvenida (1 plana A4) para nuevos usuarios de NebuApp — Rutinas del Bebé.
Genera:
  1. Bienvenida_NebuApp_Base.pdf (plantilla base con campo editable para nombres de los padres)
  2. Bienvenida_NebuApp_Elias_y_Simona.pdf (copia personalizada para Elías y Simona)

Uso opcional por consola para futuros padres:
  python generar_bienvenida_pdf.py "Nombre1 y Nombre2" "Bienvenida_NebuApp_Personalizado.pdf"
"""

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(BASE_DIR, "logo.png")


def registrar_fuentes():
    """Registra Segoe UI desde Windows Fonts para soporte completo de acentos y caracteres en español."""
    win_fonts = r"C:\Windows\Fonts"
    reg_path = os.path.join(win_fonts, "segoeui.ttf")
    bold_path = os.path.join(win_fonts, "segoeuib.ttf")
    ital_path = os.path.join(win_fonts, "segoeuii.ttf")

    if os.path.exists(reg_path) and os.path.exists(bold_path):
        pdfmetrics.registerFont(TTFont("NebuSans", reg_path))
        pdfmetrics.registerFont(TTFont("NebuSans-Bold", bold_path))
        if os.path.exists(ital_path):
            pdfmetrics.registerFont(TTFont("NebuSans-Italic", ital_path))
        else:
            pdfmetrics.registerFont(TTFont("NebuSans-Italic", reg_path))
        return "NebuSans", "NebuSans-Bold", "NebuSans-Italic"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


FONT_REG, FONT_BOLD, FONT_ITAL = registrar_fuentes()


def wrap_text(c, text, font_name, font_size, max_width):
    """Divide un texto en líneas que ajusten dentro de max_width."""
    words = text.split(" ")
    lines = []
    current = ""
    for w in words:
        cand = f"{current} {w}".strip() if current else w
        if c.stringWidth(cand, font_name, font_size) <= max_width:
            current = cand
        else:
            if current:
                lines.append(current)
            current = w
    if current:
        lines.append(current)
    return lines


def draw_wrapped_text(c, text, x, y, font_name, font_size, leading, max_width, color):
    """Dibuja texto multilínea y devuelve la nueva coordenada Y."""
    c.setFont(font_name, font_size)
    c.setFillColor(color)
    lines = wrap_text(c, text, font_name, font_size, max_width)
    cur_y = y
    for line in lines:
        c.drawString(x, cur_y, line)
        cur_y -= leading
    return cur_y


def generar_pdf_bienvenida(ruta_salida, nombres_padres=None, incluir_campo_editable=False):
    w, h = A4  # 595.27 x 841.89 pt
    c = canvas.Canvas(ruta_salida, pagesize=A4)
    c.setTitle("Bienvenida a NebuApp — Rutinas del Bebé")
    c.setAuthor("NebuApp — Rutinas del Bebé")
    c.setSubject("Guía de bienvenida e inicio rápido para padres")

    # Paleta de colores (Fusión Escénica + Luxury Editorial)
    bg_page = colors.HexColor("#F4F7FB")
    navy_dark = colors.HexColor("#0A0F24")
    navy_card = colors.HexColor("#111936")
    blue_primary = colors.HexColor("#2563EB")
    cyan_accent = colors.HexColor("#22D3EE")
    emerald = colors.HexColor("#10B981")
    amber = colors.HexColor("#F59E0B")
    violet = colors.HexColor("#7C3AED")
    rose = colors.HexColor("#E11D48")
    white = colors.HexColor("#FFFFFF")
    ink_dark = colors.HexColor("#0F172A")
    ink_body = colors.HexColor("#334155")
    ink_muted = colors.HexColor("#64748B")
    border_light = colors.HexColor("#DCE4F0")

    # 1. Fondo general de la página
    c.setFillColor(bg_page)
    c.rect(0, 0, w, h, stroke=0, fill=1)

    # 2. Banner Superior Luxury Oscuro
    header_h = 132
    header_y = h - header_h
    c.setFillColor(navy_dark)
    c.rect(0, header_y, w, header_h, stroke=0, fill=1)

    # Franja inferior de acento láser en el banner
    c.setFillColor(cyan_accent)
    c.rect(0, header_y, w, 3.5, stroke=0, fill=1)

    # Círculo decorativo suave en el header
    c.setFillColor(navy_card)
    c.circle(w - 50, h - 35, 95, stroke=0, fill=1)

    # Logo circular a la izquierda del header
    logo_x = 32
    logo_y = header_y + 24
    logo_size = 82
    c.setFillColor(white)
    c.setStrokeColor(cyan_accent)
    c.setLineWidth(2.2)
    c.circle(logo_x + logo_size / 2, logo_y + logo_size / 2, logo_size / 2 + 2, stroke=1, fill=1)

    if os.path.exists(LOGO_PATH):
        try:
            c.saveState()
            path = c.beginPath()
            path.circle(logo_x + logo_size / 2, logo_y + logo_size / 2, logo_size / 2)
            c.clipPath(path, stroke=0, fill=0)
            c.drawImage(ImageReader(LOGO_PATH), logo_x, logo_y, width=logo_size, height=logo_size, mask="auto")
            c.restoreState()
        except Exception:
            pass

    # Textos del Header
    tx = logo_x + logo_size + 18
    # Eyebrow pill
    c.setFillColor(colors.HexColor("#172554"))
    c.setStrokeColor(cyan_accent)
    c.setLineWidth(0.8)
    c.roundRect(tx, h - 36, 250, 16, 8, stroke=1, fill=1)
    # Punto luminoso vectorizado en el badge
    c.setFillColor(cyan_accent)
    c.circle(tx + 11, h - 28, 2.5, stroke=0, fill=1)
    c.setFont(FONT_BOLD, 7.5)
    c.drawString(tx + 18, h - 31, "GUÍA OFICIAL DE BIENVENIDA Y ACCESO FAMILIAR")

    # Título principal con los nombres de los padres
    c.setFont(FONT_BOLD, 17.5)
    c.setFillColor(white)
    c.drawString(tx, h - 57, "¡Bienvenidos a NebuApp!")

    # Saludo personalizado o campo editable base
    if incluir_campo_editable:
        # Etiqueta "Padres:" + recuadro editable AcroForm y texto base limpio
        c.setFont(FONT_BOLD, 11.5)
        c.setFillColor(cyan_accent)
        c.drawString(tx, h - 77, "Padres:")
        form = c.acroForm
        form.textfield(
            name="nombres_padres",
            tooltip="Escribe aquí los nombres de ambos padres (ej. Elías y Simona)",
            value=nombres_padres or "[Nombre Madre / Padre 1] y [Nombre Padre / Madre 2]",
            x=tx + 46,
            y=h - 83,
            width=345,
            height=19,
            borderStyle="solid",
            borderColor=cyan_accent,
            fillColor=navy_card,
            textColor=white,
            fontName="Helvetica-Bold",
            fontSize=11,
            borderWidth=1,
        )
    else:
        c.setFont(FONT_BOLD, 13.5)
        c.setFillColor(cyan_accent)
        c.drawString(tx, h - 76, f"Hola, {nombres_padres}")

    # Subtítulo en el header
    sub_txt = (
        "Sus correos ya fueron autorizados en la plataforma. En esta hoja encontrarán el enlace directo, "
        "cómo vincular a su bebé entre ambos padres y el resumen de los 6 módulos base disponibles."
    )
    draw_wrapped_text(c, sub_txt, tx, h - 95, FONT_REG, 8.6, 11.5, w - tx - 28, colors.HexColor("#CBD5E1"))

    # ==================== SECCIÓN 1: BARRA DE ACCESO WEB E INSTALACIÓN MÓVIL ====================
    cur_y = header_y - 14
    card1_h = 56
    card1_y = cur_y - card1_h
    margin_x = 28
    content_w = w - 2 * margin_x

    c.setFillColor(white)
    c.setStrokeColor(blue_primary)
    c.setLineWidth(1.2)
    c.roundRect(margin_x, card1_y, content_w, card1_h, 10, stroke=1, fill=1)

    # Columna izquierda: Link oficial
    c.setFont(FONT_BOLD, 8)
    c.setFillColor(blue_primary)
    c.drawString(margin_x + 14, card1_y + 40, "ENLACE OFICIAL DE ACCESO (WEB Y CELULAR)")

    app_url = "https://rektres.github.io/NebuAppWeb/"
    c.setFont(FONT_BOLD, 11.5)
    c.setFillColor(ink_dark)
    c.drawString(margin_x + 14, card1_y + 23, app_url)
    c.linkURL(app_url, (margin_x + 14, card1_y + 18, margin_x + 260, card1_y + 36), relative=0)

    c.setFont(FONT_REG, 7.8)
    c.setFillColor(ink_muted)
    c.drawString(margin_x + 14, card1_y + 9, "Haz clic en el enlace o ábrelo en el navegador de tu teléfono.")

    # Línea divisoria vertical
    div_x = margin_x + 268
    c.setStrokeColor(border_light)
    c.setLineWidth(1)
    c.line(div_x, card1_y + 8, div_x, card1_y + card1_h - 8)

    # Columna derecha: Cómo instalar como App en el teléfono
    c.setFont(FONT_BOLD, 8)
    c.setFillColor(emerald)
    c.drawString(div_x + 14, card1_y + 40, "INSTÁLALA COMO APP EN TU PANTALLA DE INICIO")

    c.setFont(FONT_BOLD, 8.2)
    c.setFillColor(ink_dark)
    c.drawString(div_x + 14, card1_y + 25, "• iPhone (Safari):")
    c.setFont(FONT_REG, 8.2)
    c.setFillColor(ink_body)
    c.drawString(div_x + 88, card1_y + 25, "Botón Compartir  ->  \"Agregar a inicio\".")

    c.setFont(FONT_BOLD, 8.2)
    c.setFillColor(ink_dark)
    c.drawString(div_x + 14, card1_y + 11, "• Android (Chrome):")
    c.setFont(FONT_REG, 8.2)
    c.setFillColor(ink_body)
    c.drawString(div_x + 98, card1_y + 11, "Menú (3 puntos)  ->  \"Instalar aplicación\".")

    # ==================== SECCIÓN 2: CÓMO COMENZAR EN 3 PASOS ====================
    cur_y = card1_y - 18
    c.setFont(FONT_BOLD, 10.8)
    c.setFillColor(ink_dark)
    c.drawString(margin_x, cur_y, "1. Cómo comenzar y vincular a ambos padres (3 pasos)")

    cur_y -= 9
    step_h = 100
    step_y = cur_y - step_h
    step_gap = 10
    step_w = (content_w - 2 * step_gap) / 3.0

    pasos = [
        (
            "PASO 1",
            "Crear cuenta autorizada",
            blue_primary,
            "Ingresa al enlace oficial, pulsa \"¿No tienes cuenta? Regístrate\", escribe tu correo electrónico autorizado y define tu contraseña. Luego inicia sesión con tus datos.",
        ),
        (
            "PASO 2",
            "Vincular al bebé (Código)",
            emerald,
            "El primer padre elige su rol (Madre/Padre), crea al bebé y en Configuración (icono engranaje) copia el Código único de 6 letras. El segundo padre inicia sesión y se une ingresando ese código.",
        ),
        (
            "PASO 3",
            "Tutorial inicial guiado",
            violet,
            "Al entrar por primera vez se abrirá un recorrido interactivo obligatorio de 6 pasos por los módulos base. Puedes repetirlo cuando quieras con el botón \"Tutorial\" arriba a la derecha.",
        ),
    ]

    for i, (badge, titulo, col_acc, desc) in enumerate(pasos):
        sx = margin_x + i * (step_w + step_gap)
        c.setFillColor(white)
        c.setStrokeColor(border_light)
        c.setLineWidth(1)
        c.roundRect(sx, step_y, step_w, step_h, 9, stroke=1, fill=1)

        # Barra superior de color en cada tarjeta de paso
        c.setFillColor(col_acc)
        c.roundRect(sx, step_y + step_h - 5, step_w, 5, 2, stroke=0, fill=1)

        # Badge de paso
        c.setFillColor(col_acc)
        c.roundRect(sx + 10, step_y + step_h - 23, 44, 13, 6, stroke=0, fill=1)
        c.setFont(FONT_BOLD, 7.2)
        c.setFillColor(white)
        c.drawString(sx + 17, step_y + step_h - 19, badge)

        # Título del paso
        c.setFont(FONT_BOLD, 9.2)
        c.setFillColor(ink_dark)
        c.drawString(sx + 10, step_y + step_h - 37, titulo)

        # Descripción
        draw_wrapped_text(c, desc, sx + 10, step_y + step_h - 51, FONT_REG, 8.0, 10.8, step_w - 20, ink_body)

    # ==================== SECCIÓN 3: LOS 6 MÓDULOS BASE DISPONIBLES ====================
    cur_y = step_y - 20
    c.setFont(FONT_BOLD, 10.8)
    c.setFillColor(ink_dark)
    c.drawString(margin_x, cur_y, "2. Tus 6 Módulos Base incluidos desde el primer día")

    cur_y -= 9
    mod_cols = 2
    mod_rows = 3
    mod_gap_x = 12
    mod_gap_y = 11
    mod_w = (content_w - mod_gap_x) / 2.0
    mod_h = 114

    modulos = [
        (
            "1. STATS · Estadísticas y Curvas MINSAL",
            "Panel Analítico y Crecimiento",
            blue_primary,
            "• Gráficos interactivos de Rutina Diaria (Leche, Pañales y Sueño) filtrables por 1 día, 7 días, 14 días o 1 mes con zoom táctil.\n"
            "• Subpestaña de Curvas de Crecimiento Infantil MINSAL / OMS (0 a 24 meses): Peso/Edad, Talla/Edad, Perímetro Cefálico y Peso/Talla.",
        ),
        (
            "2. LECHE · Tomas y Meta Diaria",
            "Control de Alimentación Láctea",
            colors.HexColor("#0284C7"),
            "• Registra cada toma en mililitros (ml) con fecha y hora actual o pasada en un toque.\n"
            "• Visualiza al instante cuánto tiempo pasó desde la última toma y el avance porcentual de tu objetivo diario de leche.",
        ),
        (
            "3. PAÑALES · Cambios y Escala de Bristol",
            "Salud Digestiva Pediátrica",
            amber,
            "• Registra cambios de Orina y/o Heces y monitorea el tiempo transcurrido desde el último cambio y última deposición.\n"
            "• Al marcar Heces se despliega la Escala de Bristol Pediátrica (tipos 1 al 7) con diagnóstico del estado y consejo práctico.",
        ),
        (
            "4. COMIDAS · Plato Dinámico Semanal",
            "Alimentación Complementaria y Alérgenos",
            emerald,
            "• Arma el plato diario combinando los 5 grupos (Verdura, Fruta, Proteína, Grasa y Cereal/Tubérculo) más aliños opcionales.\n"
            "• Catálogo de 144 alimentos con lupa, simbología nutricional (Fibra, Calcio, Hierro, Alérgeno), botón \"+ Nuevo\" y registro de alergias.",
        ),
        (
            "5. SUEÑO · Descanso y Siesta en Vivo",
            "Ventana de Vigilia y Siestas",
            violet,
            "• Observa cuánto tiempo lleva despierto o durmiendo tu bebé en tiempo real.\n"
            "• Inicia o finaliza una siesta con un toque (\"Se durmió ahora\" / \"Despertó\") o registra sueños manuales con división automática a medianoche.",
        ),
        (
            "6. INFO · Ficha Clínica y Niño Sano",
            "Perfil Clínico, Alergias y Controles MINSAL",
            rose,
            "• Gestiona foto, sexo biológico (curvas MINSAL), grupo sanguíneo, fecha de nacimiento fija y selector de alergias por categoría.\n"
            "• Registra cada Control de Niño Sano (10d, 15d, 1m, 2m... 24m) con Peso, Talla y P. Cefálico (hasta 2 decimales con coma, ej: 7,3 kg) y avisos 5 días antes y 1h después.",
        ),
    ]

    for idx, (titulo_mod, sub_mod, col_mod, texto_mod) in enumerate(modulos):
        row = idx // mod_cols
        col = idx % mod_cols
        mx = margin_x + col * (mod_w + mod_gap_x)
        my = cur_y - (row + 1) * mod_h - row * mod_gap_y

        # Tarjeta del módulo
        c.setFillColor(white)
        c.setStrokeColor(border_light)
        c.setLineWidth(1)
        c.roundRect(mx, my, mod_w, mod_h, 9, stroke=1, fill=1)

        # Borde lateral izquierdo de color
        c.setFillColor(col_mod)
        c.roundRect(mx, my, 4.5, mod_h, 2, stroke=0, fill=1)

        # Título y subtítulo del módulo
        c.setFont(FONT_BOLD, 9.6)
        c.setFillColor(ink_dark)
        c.drawString(mx + 13, my + mod_h - 17, titulo_mod)

        c.setFont(FONT_BOLD, 7.5)
        c.setFillColor(col_mod)
        c.drawString(mx + 13, my + mod_h - 29, sub_mod.upper())

        # Bullets descriptivos
        parrafos = texto_mod.split("\n")
        py = my + mod_h - 43
        for p in parrafos:
            py = draw_wrapped_text(c, p, mx + 13, py, FONT_REG, 8.0, 10.8, mod_w - 24, ink_body)
            py -= 2.5

    # ==================== SECCIÓN 4: PERSONALIZACIÓN Y RECORDATORIO FINAL ====================
    bottom_box_y = 40
    bottom_box_h = 52
    c.setFillColor(navy_dark)
    c.setStrokeColor(cyan_accent)
    c.setLineWidth(1)
    c.roundRect(margin_x, bottom_box_y, content_w, bottom_box_h, 9, stroke=1, fill=1)

    c.setFillColor(cyan_accent)
    c.circle(margin_x + 17, bottom_box_y + 36, 3, stroke=0, fill=1)
    c.setFont(FONT_BOLD, 8.6)
    c.drawString(margin_x + 25, bottom_box_y + 33, "TIPS DE PERSONALIZACIÓN Y CONFIGURACIÓN (ICONO ENGRANAJE ARRIBA A LA DERECHA)")

    tips_txt = (
        "En Configuración pueden elegir entre 5 paletas de colores (Celeste, Rosa, Verde, Lila, Ámbar), modo Oscuro o Claro, "
        "fondos animados relajantes (Mar o Espacio), reordenar las pestañas de la barra inferior y repetir el Tutorial Inicial cuando lo deseen."
    )
    draw_wrapped_text(c, tips_txt, margin_x + 14, bottom_box_y + 20, FONT_REG, 7.8, 10.2, content_w - 28, colors.HexColor("#E2E8F0"))

    # Footer
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(ink_muted)
    footer_left = "NebuApp — Rutinas del Bebé · Plataforma colaborativa para madres y padres"
    footer_right = "Acceso web: https://rektres.github.io/NebuAppWeb/"
    c.drawString(margin_x, 22, footer_left)
    rw = c.stringWidth(footer_right, FONT_BOLD, 7.5)
    c.setFont(FONT_BOLD, 7.5)
    c.setFillColor(blue_primary)
    c.drawString(w - margin_x - rw, 22, footer_right)

    c.showPage()
    c.save()
    return ruta_salida


def main():
    ruta_base = os.path.join(BASE_DIR, "Bienvenida_NebuApp_Base.pdf")
    ruta_elias_simona = os.path.join(BASE_DIR, "Bienvenida_NebuApp_Elias_y_Simona.pdf")

    generar_pdf_bienvenida(
        ruta_base,
        nombres_padres="[Nombre Madre / Padre 1] y [Nombre Padre / Madre 2]",
        incluir_campo_editable=True,
    )
    print(f"Generado PDF base editable: {ruta_base}")

    generar_pdf_bienvenida(
        ruta_elias_simona,
        nombres_padres="Elías y Simona",
        incluir_campo_editable=False,
    )
    print(f"Generado PDF personalizado: {ruta_elias_simona}")

    # Si se pasa un nombre personalizado adicional por línea de comandos
    if len(sys.argv) >= 2:
        nombres_cli = sys.argv[1].strip()
        archivo_cli = sys.argv[2].strip() if len(sys.argv) >= 3 else f"Bienvenida_NebuApp_{nombres_cli.replace(' ', '_')}.pdf"
        ruta_cli = os.path.join(BASE_DIR, archivo_cli)
        generar_pdf_bienvenida(ruta_cli, nombres_padres=nombres_cli, incluir_campo_editable=False)
        print(f"Generado PDF adicional: {ruta_cli}")


if __name__ == "__main__":
    main()
