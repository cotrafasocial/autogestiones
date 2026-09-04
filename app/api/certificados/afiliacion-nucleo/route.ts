import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import QRCode from "qrcode";
import nodemailer from "nodemailer";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContratoKaring = Record<string, unknown>;
const LIMITE_DIARIO_AFILIACION_NUCLEO = 3;
  type PlanExequialCertificado = {
    contrato: string;
    producto: string;
    finalizaVigencia: string | null;
  };

  type BeneficiarioCertificado = {
    nombreCompleto: string;
    documento: string;
    documentoNormalizado: string;
    parentesco: string;
    fechaAfiliacion: string;
  };

  type ContratoMoroso = {
    contrato: string;
    producto: string;
    cantidadRegistrosCartera: number;
    esContratoCancelado: boolean;
  };

const PRODUCTOS_EXEQUIALES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  13, 14, 15, 16, 17, 18, 19, 20,
  481, 482, 483, 484, 485, 486, 487, 489, 490, 491, 492, 493, 494, 495,
  496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509,
  510, 511, 512, 513, 514, 515, 628, 734, 1804, 1805, 1880,1894, 1895, 1896,
  1898, 1899, 1900, 1903,
]);

function obtenerTexto(valor: unknown) {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function obtenerNumero(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return valor;
  }

  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor.trim());
    return Number.isFinite(numero) ? numero : null;
  }

  return null;
}

function contratoEstaVigente(contrato: ContratoKaring) {
  const renovacion = String(contrato.renovacion ?? "")
    .trim()
    .toUpperCase();

  return renovacion !== "C";
}

function contratoEstaCancelado(contrato: ContratoKaring) {
  const renovacion = String(contrato.renovacion ?? "")
    .trim()
    .toUpperCase();

  return renovacion === "C";
}

function contratoEsExequial(contrato: ContratoKaring) {
  const productoPrevision = obtenerNumero(contrato.producto_prevision);

  if (productoPrevision === null) {
    return false;
  }

  return PRODUCTOS_EXEQUIALES.has(productoPrevision);
}

const NIT_COTRAFA_SOCIAL = "811017024";

function normalizarNit(valor: unknown) {
  return String(valor || "").replace(/\D/g, "").trim();
}

function contratoEsEmpresarial(contrato: ContratoKaring) {
  const nitGrupal = normalizarNit(contrato.nit_grupal);

  return nitGrupal !== "" && nitGrupal !== NIT_COTRAFA_SOCIAL;
}

function contratoTieneActionActiva(contrato: ContratoKaring) {
  return String(contrato.action ?? "").trim().toUpperCase() === "A";
}

function obtenerContratosEmpresarialesVigentes(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return (
      contratoTieneActionActiva(contrato) &&
      contratoEstaVigente(contrato) &&
      contratoEsEmpresarial(contrato)
    );
  });
}

function obtenerContratosExequialesVigentes(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return contratoEstaVigente(contrato) && contratoEsExequial(contrato);
  });
}

function obtenerTipoIdentificacionTexto(codigo: string | null) {
  const tipos: Record<string, string> = {
    "31": "cedula de ciudadania",
    "13": "cedula de ciudadania",
    "12": "tarjeta de identidad",
    "11": "registro civil",
    "22": "cédula de extranjería",
  };

  if (!codigo) {
    return null;
  }

  return tipos[codigo.trim()] || codigo.trim();
}

function obtenerFechaMasAntiguaAfiliacion(contratos: ContratoKaring[]) {
  const fechas = contratos
    .map((contrato) => contrato.fecha_afiliacion)
    .filter((fecha): fecha is string => typeof fecha === "string" && fecha.trim() !== "")
    .map((fecha) => new Date(fecha))
    .filter((fecha) => !isNaN(fecha.getTime()));

  if (fechas.length === 0) {
    return null;
  }

  return fechas.reduce((fechaMenor, fechaActual) => {
    return fechaActual < fechaMenor ? fechaActual : fechaMenor;
  });
}

function obtenerAnioAfiliacionMasAntiguo(contratos: ContratoKaring[]) {
  const fechaMasAntigua = obtenerFechaMasAntiguaAfiliacion(contratos);

  if (!fechaMasAntigua) {
    return null;
  }

  return fechaMasAntigua.getFullYear();
}

function obtenerDatosTitular(contratos: ContratoKaring[]) {
  const contratoBase = contratos[0];
  const anioAfiliacion = obtenerAnioAfiliacionMasAntiguo(contratos);

  const primerNombre = obtenerTexto(contratoBase?.primer_nombre);
  const segundoNombre = obtenerTexto(contratoBase?.segundo_nombre);
  const primerApellido = obtenerTexto(contratoBase?.primer_apellido);
  const segundoApellido = obtenerTexto(contratoBase?.segundo_apellido);

  const nombreCompleto = [
    primerNombre,
    segundoNombre,
    primerApellido,
    segundoApellido,
  ]
    .filter(Boolean)
    .join(" ");

  const tipoIdentificacionCodigo = obtenerTexto(contratoBase?.tipo_identificacion);

  return {
    nombre: nombreCompleto || null,
    tipoIdentificacion: obtenerTipoIdentificacionTexto(tipoIdentificacionCodigo),
    identificacion: obtenerTexto(contratoBase?.identificacion),
    anioAfiliacion,
    genero: obtenerTexto(contratoBase?.genero),
    email: obtenerTexto(contratoBase?.email),
  };
}

async function obtenerToken() {
  const authUrl = process.env.KARING_AUTH_URL;
  const usuario = process.env.KARING_USER;
  const clave = process.env.KARING_PASSWORD;

  if (!authUrl || !usuario || !clave) {
    throw new Error("Faltan variables de entorno de autenticación.");
  }

  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      usuario,
      clave,
      "Accept-Encoding": "identity",
    },
  });

  const textoRespuesta = await response.text();

  if (!response.ok) {
    throw new Error("No fue posible autenticar.");
  }

  const token = textoRespuesta.replace(/^"|"$/g, "").trim();

  if (!token) {
    throw new Error("La API autenticó, pero no devolvió token.");
  }

  return token;
}

async function consultarContratos(identificacion: string) {
  const contratosUrl = process.env.KARING_CONTRATOS_URL;

  if (!contratosUrl) {
    throw new Error("Falta configurar la URL de contratos.");
  }

  const token = await obtenerToken();

  const urlConsulta = new URL(contratosUrl);
  urlConsulta.searchParams.set("identificacion", identificacion);

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": token,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    },
  });

  if (!response.ok) {
    throw new Error("No fue posible consultar contratos.");
  }

  const textoRespuesta = await response.text();

let data: unknown;

try {
  data = JSON.parse(textoRespuesta);
} catch {
  throw new Error("La respuesta de contratos no tiene formato JSON válido.");
}

if (!Array.isArray(data) || data.length === 0) {
  throw new Error("No se encontraron contratos.");
}

return data as ContratoKaring[];
}

async function consultarContratoPorNumero(contrato: string, token: string) {
  const contratoUrl = process.env.KARING_CONTRATO_URL;

  if (!contratoUrl) {
    throw new Error("Falta configurar la URL de consulta de contrato.");
  }

  const urlConsulta = new URL(contratoUrl);
  urlConsulta.searchParams.set("contrato", contrato);

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": token,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    },
  });

  if (!response.ok) {
    throw new Error("No fue posible consultar el detalle del contrato.");
  }

  const textoRespuesta = await response.text();

  try {
    return JSON.parse(textoRespuesta) as Record<string, unknown>;
  } catch {
    throw new Error("La respuesta del contrato no tiene formato JSON válido.");
  }
}

function obtenerCarteraControlDesdeDetalle(detalleContrato: unknown) {
  if (
    detalleContrato &&
    typeof detalleContrato === "object" &&
    !Array.isArray(detalleContrato)
  ) {
    return (detalleContrato as Record<string, unknown>).carteraControl;
  }

  return null;
}

function obtenerNombreProductoDesdeDetalle(detalleContrato: unknown) {
    if (
      !detalleContrato ||
      typeof detalleContrato !== "object" ||
      Array.isArray(detalleContrato)
    ) {
      return "Plan exequial";
    }
  
    const amparos = (detalleContrato as Record<string, unknown>).amparos;
  
    if (!Array.isArray(amparos) || amparos.length === 0) {
      return "Plan exequial";
    }
  
    const primerAmparo = amparos[0];
  
    if (
      !primerAmparo ||
      typeof primerAmparo !== "object" ||
      Array.isArray(primerAmparo)
    ) {
      return "Plan exequial";
    }
  
    return (
      obtenerTexto(
        (primerAmparo as Record<string, unknown>).descripcion_producto
      ) || "Plan exequial"
    );
  }

  function formatearFechaCorta(fechaTexto: string | null) {
    if (!fechaTexto) {
      return "";
    }
  
    const fecha = new Date(fechaTexto);
  
    if (isNaN(fecha.getTime())) {
      return "";
    }
  
    return fecha.toLocaleDateString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  
  function formatearDocumento(documento: string | null) {
    if (!documento) {
      return "";
    }
  
    return documento.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  
  function normalizarDocumento(documento: string | null) {
    if (!documento) {
      return "";
    }
  
    return documento.replace(/\D/g, "").trim();
  }
  
  function obtenerNombreCompletoPersona(persona: Record<string, unknown>) {
    return [
      obtenerTexto(persona.primer_nombre),
      obtenerTexto(persona.segundo_nombre),
      obtenerTexto(persona.primer_apellido),
      obtenerTexto(persona.segundo_apellido),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  
  function obtenerParentescoTexto(codigo: string | null) {
    const parentescos: Record<string, string> = {
      "0": "Cónyuge",
      "1": "Padre",
      "2": "Madre",
      "3": "Hermano(a)",
      "4": "Suegro(a)",
      "5": "Hijo(a)",
      "7": "Titular",
      "10": "Nuera",
      "11": "Cuñado",
      "12": "Tío",
      "13": "Sobrino(a)",
      "14": "Nieto(a)",
      "15": "Abuelo(a)",
      "16": "Hijastro(a)",
      "17": "Padrastro",
      "18": "Madrastra",
      "20": "Primo(a)",
      "21": "Esposo(a)",
      "23": "Bisnieto(a)",
      "24": "Bisabuelo(a)",
      "25": "Compañero Permanente",
      "30": "Hermanastro(a)",
      "33": "Yerno",
      "34": "Abuelo del Cónyuge",
      "35": "No Aplica",
      "36": "Hijo Adoptivo",
      "37": "Mascotas",
      "38": "Titular Protegido",
      "99": "Particular",
    };
  
    if (!codigo) {
      return "Beneficiario";
    }
  
    const codigoLimpio = codigo.trim();
  
    return parentescos[codigoLimpio] || codigoLimpio;
  }

  function obtenerParentescoPersona(persona: Record<string, unknown>) {
    const posiblesTextos = [
      persona.descripcion_parentesco,
      persona.parentesco_descripcion,
      persona.nombre_parentesco,
      persona.parentesco_nombre,
      persona.descripcionParentesco,
      persona.parentesco_texto,
    ];
  
    for (const valor of posiblesTextos) {
      const texto = obtenerTexto(valor);
  
      if (texto && isNaN(Number(texto))) {
        return texto;
      }
    }
  
    return obtenerParentescoTexto(obtenerTexto(persona.parentesco));
  }
  
  function obtenerBeneficiariosActivosDesdeDetalle(
    detalleContrato: unknown,
    identificacionTitular: string
  ): BeneficiarioCertificado[] {
    if (
      !detalleContrato ||
      typeof detalleContrato !== "object" ||
      Array.isArray(detalleContrato)
    ) {
      return [];
    }
  
    const asegurados = (detalleContrato as Record<string, unknown>).asegurados;
  
    if (!Array.isArray(asegurados)) {
      return [];
    }
  
    const beneficiariosPorDocumento = new Map<string, BeneficiarioCertificado>();
  
    for (const asegurado of asegurados) {
      if (
        !asegurado ||
        typeof asegurado !== "object" ||
        Array.isArray(asegurado)
      ) {
        continue;
      }
  
      const persona = asegurado as Record<string, unknown>;
  
      const identificacion = obtenerTexto(persona.identificacion);
      const fechaRetiro = obtenerTexto(persona.fecha_retiro);
      const fechaFallecio = obtenerTexto(persona.fecha_fallecio);
      const adicional = obtenerTexto(persona.adicional);
  
      if (!identificacion) {
        continue;
      }
  
      // Excluir titular
      if (identificacion.trim() === identificacionTitular.trim()) {
        continue;
      }
  
      // Excluir registro marcado como titular
      if (adicional?.trim().toUpperCase() === "T") {
        continue;
      }
  
      // Solo activos
      if (fechaRetiro || fechaFallecio) {
        continue;
      }
  
      const nombreCompleto = obtenerNombreCompletoPersona(persona);
  
      if (!nombreCompleto) {
        continue;
      }
  
      const fechaAfiliacionTexto = obtenerTexto(persona.fecha_afiliacion);
  
      const documentoNormalizado = normalizarDocumento(identificacion);

      const beneficiario: BeneficiarioCertificado = {
        nombreCompleto,
        documento: formatearDocumento(identificacion),
        documentoNormalizado,
        parentesco: obtenerParentescoPersona(persona),
        fechaAfiliacion: formatearFechaCorta(fechaAfiliacionTexto),
      };
  
      const beneficiarioActual = beneficiariosPorDocumento.get(identificacion);
  
      if (!beneficiarioActual) {
        beneficiariosPorDocumento.set(identificacion, beneficiario);
        continue;
      }
  
      const fechaActual = new Date(beneficiarioActual.fechaAfiliacion);
      const fechaNueva = fechaAfiliacionTexto ? new Date(fechaAfiliacionTexto) : null;
  
      if (fechaNueva && !isNaN(fechaNueva.getTime())) {
        beneficiariosPorDocumento.set(identificacion, beneficiario);
      }
    }
  
    return Array.from(beneficiariosPorDocumento.values());
  }

  async function obtenerPlanesExequialesAlDia(
    contratosExequiales: ContratoKaring[],
    identificacionTitular: string
  ): Promise<{
    estaAlDia: boolean;
    planes: PlanExequialCertificado[];
    contratosMorosos: ContratoMoroso[];
    beneficiarios: BeneficiarioCertificado[];
  }> {
    const token = await obtenerToken();
  
    const planes: PlanExequialCertificado[] = [];
    const contratosMorosos: ContratoMoroso[] = [];
    const beneficiarios: BeneficiarioCertificado[] = [];
  
    for (const contrato of contratosExequiales) {
      const esContratoCancelado = contratoEstaCancelado(contrato);
    
      const numeroContrato = obtenerTexto(contrato.contrato);
    
      if (!numeroContrato) {
        throw new Error("Un contrato exequial vigente no tiene número de contrato.");
      }
    
      const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);

      const beneficiariosContrato = obtenerBeneficiariosActivosDesdeDetalle(
        detalleContrato,
        identificacionTitular
      );
      
      beneficiarios.push(...beneficiariosContrato);
  
      const producto = obtenerNombreProductoDesdeDetalle(detalleContrato);
  
      const carteraControl = obtenerCarteraControlDesdeDetalle(detalleContrato);
  
      if (!Array.isArray(carteraControl)) {
        console.error(
          "No se encontró carteraControl válido para contrato:",
          numeroContrato
        );
  
        throw new Error("La respuesta del contrato no contiene carteraControl válido.");
      }
  
      if (carteraControl.length > 0) {
        contratosMorosos.push({
          contrato: numeroContrato,
          producto,
          cantidadRegistrosCartera: carteraControl.length,
          esContratoCancelado,
        });
      
        continue;
      }
  
      if (!esContratoCancelado) {
        planes.push({
          contrato: numeroContrato,
          producto,
          finalizaVigencia:
            obtenerTexto(contrato.finaliza_vigencia) ||
            obtenerTexto(contrato.finalizaVigencia) ||
            null,
        });
      }
    }
  
    const beneficiariosUnicos = Array.from(
      new Map(
        beneficiarios.map((beneficiario) => [
          beneficiario.documentoNormalizado,
          beneficiario,
        ])
      ).values()
    );
    
    return {
      estaAlDia: contratosMorosos.length === 0,
      planes,
      contratosMorosos,
      beneficiarios: beneficiariosUnicos,
    };
  }

function obtenerFechaActualTexto() {
  return new Date().toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function obtenerFechaRegistroTexto() {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function obtenerFechaDiaColombia() {
  return new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function obtenerSoloFechaDesdeRegistro(fechaRegistro: unknown) {
  if (typeof fechaRegistro !== "string") {
    return "";
  }

  return fechaRegistro.split(",")[0].trim();
}

function obtenerClienteGoogleSheets() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const subject = process.env.GOOGLE_WORKSPACE_SUBJECT;

  if (!clientEmail || !privateKey || !subject) {
    throw new Error("Faltan variables de entorno de Google Workspace.");
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    subject,
  });
}

async function contarSolicitudesAfiliacionNucleoHoy(identificacion: string) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Solicitudes'!A:I",
  });

  const filas = respuesta.data.values || [];
  const fechaHoy = obtenerFechaDiaColombia();
  const identificacionNormalizada = identificacion.trim();

  return filas.filter((fila) => {
    const fechaCreacion = obtenerSoloFechaDesdeRegistro(fila[0]);
    const usuCreacion = String(fila[2] || "").trim();
    const tipoDoc = String(fila[5] || "").trim().toLowerCase();
    const quienNecesitaDoc = String(fila[6] || "").trim().toLowerCase();

    return (
      fechaCreacion === fechaHoy &&
      usuCreacion === identificacionNormalizada &&
      tipoDoc === "afiliación núcleo familiar" &&
      quienNecesitaDoc === "titular"
    );
  }).length;
}

async function registrarSolicitudEnSheets(datos: {
  fechaCreacion: string;
  usuCreacion: string;
  codigoDoc: string;
  tipoDoc: string;
  quienNecesitaDoc: string;
  dirigidoADoc: string;
  datosDoc: string;
}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Solicitudes'!A:I",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaCreacion,
          "",
          datos.usuCreacion,
          "",
          datos.codigoDoc,
          datos.tipoDoc,
          datos.quienNecesitaDoc,
          datos.dirigidoADoc,
          datos.datosDoc,
        ],
      ],
    },
  });
}

async function registrarSolicitudNivel2Certificados(datos: {
  fechaSolicitud: string;
  contrato: string;
  cedula: string;
  nombre: string;
  dirigidoA: string;
  correo: string;
  codigoSolicitud: string;
  tipo: string;
  certificado: string;
}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_NIVEL2_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_NIVEL2_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'7. CERTIFICADOS'!A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaSolicitud,
          "APLICATIVO WEB",
          "",
          datos.contrato,
          datos.cedula,
          datos.nombre,
          datos.dirigidoA,
          "Correo",
          `${datos.correo} / ${datos.codigoSolicitud}`,
          datos.tipo,
          datos.certificado,
        ],
      ],
    },
  });
}

function generarCodigoAutenticidad() {
  const fecha = new Date();

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `CS-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
}

async function obtenerConfiguracionPuppeteer() {
  const chromeLocal =
    process.env.CHROME_EXECUTABLE_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  if (process.platform === "win32") {
    return {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: chromeLocal,
      headless: true,
    };
  }

  return {
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  };
}

function generarHtmlCorreoCertificadoNucleo(datos: {
  nombreAfiliado: string;
  nombreCertificado: string;
}) {
  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  const imagenCorreo = `${urlBase}/correos/respuesta-correo-certi.jpg`;

  return `
    <!doctype html>
    <html>
      <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.08);">
                
                <tr>
                  <td>
                    <img
                      src="${imagenCorreo}"
                      alt="Certificado generado Cotrafa Social"
                      style="display:block; width:100%; max-width:680px; height:auto; border:0;"
                    />
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 38px 30px; text-align:center;">
                    <h1 style="margin:0; color:#002869; font-size:26px; line-height:1.3; font-weight:800;">
                      Certificado generado exitosamente
                    </h1>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Hola, <strong style="color:#002869;">${datos.nombreAfiliado}</strong>.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Nos complace informarte que tu certificado de
                      <strong style="color:#002869;">${datos.nombreCertificado}</strong>
                      ha sido generado exitosamente.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Lo encontrarás adjunto en este correo para que puedas consultarlo,
                      descargarlo o compartirlo cuando lo necesites.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      En Cotrafa Social seguimos trabajando para ofrecerte servicios más ágiles
                      y digitales que faciliten tus trámites.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Gracias por ser parte de nuestra comunidad de afiliados.
                    </p>

                    <p style="margin:26px 0 0; color:#002869; font-size:15px; line-height:1.6; font-weight:700;">
                      Cotrafa Social
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background:#002869; padding:18px 28px; text-align:center;">
                    <p style="margin:0; color:#ffffff; font-size:11px; line-height:1.5;">
                      Este mensaje fue generado automáticamente. Por favor no respondas a este correo.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function enviarCertificadoPorCorreo(datos: {
  destinatario: string;
  pdfBytes: Buffer;
  codigoAutenticidad: string;
  nombreAfiliado: string;
  nombreCertificado: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Faltan variables de entorno para envío de correo.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: `"Cotrafa Social" <${from}>`,
    to: datos.destinatario,
    subject: "Certificado de Afiliación con Núcleo Familiar",
    html: generarHtmlCorreoCertificadoNucleo({
      nombreAfiliado: datos.nombreAfiliado,
      nombreCertificado: datos.nombreCertificado,
    }),
    attachments: [
      {
        filename: "certificado-afiliacion-nucleo-familiar.pdf",
        content: datos.pdfBytes,
        contentType: "application/pdf",
      },
    ],
  });
}

function generarHtmlCorreoNoPosibleNucleo(datos: {
  nombre: string;
  identificacion: string;
  contratosHtml: string;
}) {
  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  const imagenCorreo = `${urlBase}/correos/correo-noposible.png`;

  return `
    <!doctype html>
    <html>
      <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.08);">

                <tr>
                  <td>
                    <img
                      src="${imagenCorreo}"
                      alt="Solicitud en revisión Cotrafa Social"
                      style="display:block; width:100%; max-width:680px; height:auto; border:0;"
                    />
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 38px 30px; text-align:center;">
                    <h1 style="margin:0; color:#002869; font-size:26px; line-height:1.3; font-weight:800;">
                      Estamos revisando tu solicitud
                    </h1>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Hola, <strong style="color:#002869;">${datos.nombre}</strong>.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Hemos recibido tu solicitud de
                      <strong style="color:#002869;">Certificado de afiliación con núcleo familiar</strong>.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Al realizar la validación, encontramos que actualmente presentas cartera
                      pendiente, por lo que no fue posible generar el certificado automáticamente.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
                      <tr>
                        <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                          <strong style="color:#002869;">Nombre:</strong> ${datos.nombre}<br />
                          <strong style="color:#002869;">Identificación:</strong> ${datos.identificacion}
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px; background:#fff7ed; border:1px solid #fed7aa; border-radius:12px;">
                      <tr>
                        <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                          <strong style="color:#9a3412;">Contratos con cartera pendiente:</strong>
                          <ul style="margin:10px 0 0 20px; padding:0;">
                            ${datos.contratosHtml}
                          </ul>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Para continuar con la generación del certificado, te invitamos a ponerte
                      al día o comunicarte con nuestra línea de atención al cliente 456 7000 para recibir acompañamiento.
                    </p>

                    <p style="margin:20px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      En Cotrafa Social seguimos trabajando para ofrecerte servicios más ágiles y digitales
                      que faciliten tus trámites.
                    </p>

                    <p style="margin:26px 0 0; color:#002869; font-size:15px; line-height:1.6; font-weight:700;">
                      Cotrafa Social
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background:#002869; padding:18px 28px; text-align:center;">
                    <p style="margin:0; color:#ffffff; font-size:11px; line-height:1.5;">
                      Este mensaje fue generado automáticamente. Por favor no respondas a este correo.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function enviarCorreoContratosMorosos(datos: {
  destinatario: string;
  nombre: string;
  identificacion: string;
  contratosMorosos: ContratoMoroso[];
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Faltan variables de entorno para envío de correo.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  const contratosActivosMorosos = datos.contratosMorosos.filter(
    (item) => !item.esContratoCancelado
  );
  
  const hayContratosCanceladosMorosos = datos.contratosMorosos.some(
    (item) => item.esContratoCancelado
  );
  
  const contratosHtml =
    contratosActivosMorosos.length > 0
      ? contratosActivosMorosos
          .map(
            (item) => `
              <li>
                Contrato <strong>${item.contrato}</strong>
                ${
                  item.producto
                    ? ` - Producto: <strong>${item.producto}</strong>`
                    : ""
                }
              </li>
            `
          )
          .join("")
      : hayContratosCanceladosMorosos
        ? `
          <li>
            Presentas cartera pendiente asociada a un contrato cancelado.
          </li>
        `
        : "";

  await transporter.sendMail({
    from: `"Cotrafa Social" <${from}>`,
    to: datos.destinatario,
    subject: "Información sobre tu solicitud de certificado",
    html: generarHtmlCorreoNoPosibleNucleo({
      nombre: datos.nombre,
      identificacion: datos.identificacion,
      contratosHtml,
    }),
  });
}

function generarHtmlSolicitudEmpresarialNucleo(datos: {
  nombre: string;
  identificacion: string;
  tipoCertificado: string;
}) {
  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  const imagenCorreo = `${urlBase}/correos/respuesta-correo-soli.jpg`;

  return `
    <!doctype html>
    <html>
      <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.08);">
                
                <tr>
                  <td>
                    <img
                      src="${imagenCorreo}"
                      alt="Solicitud registrada Cotrafa Social"
                      style="display:block; width:100%; max-width:680px; height:auto; border:0;"
                    />
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 38px 30px; text-align:center;">
                    <h1 style="margin:0; color:#002869; font-size:26px; line-height:1.3; font-weight:800;">
                      Hemos recibido tu solicitud
                    </h1>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Hemos recibido tu solicitud de
                      <strong style="color:#002869;">${datos.tipoCertificado}</strong>.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
                      <tr>
                        <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                          <strong style="color:#002869;">Nombre:</strong> ${datos.nombre}<br />
                          <strong style="color:#002869;">Identificación:</strong> ${datos.identificacion}
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      En un plazo máximo de <strong>tres (3) días hábiles</strong>, te enviaremos una respuesta
                      o actualización sobre el estado de tu trámite al último correo electrónico registrado
                      en nuestro sistema, en caso de no recibir respuesta comunuicate al 456 7000.
                    </p>

                    <p style="margin:26px 0 0; color:#002869; font-size:15px; line-height:1.6; font-weight:700;">
                      Cotrafa Social
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background:#002869; padding:18px 28px; text-align:center;">
                    <p style="margin:0; color:#ffffff; font-size:11px; line-height:1.5;">
                      Este mensaje fue generado automáticamente. Por favor no respondas a este correo.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function enviarCorreoSolicitudEmpresarial(datos: {
  destinatario: string;
  nombre: string;
  identificacion: string;
  codigoSolicitud: string;
  tipoCertificado: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Faltan variables de entorno para envío de correo.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: `"Cotrafa Social" <${from}>`,
    to: datos.destinatario,
    subject: "Solicitud de certificado registrada",
    html: generarHtmlSolicitudEmpresarialNucleo({
      nombre: datos.nombre,
      identificacion: datos.identificacion,
      tipoCertificado: datos.tipoCertificado,
    }),
  });
}

async function generarPdfAfiliacionNucleo(datos: {
  nombre: string;
  tipoIdentificacion: string;
  identificacion: string;
  anioAfiliacion: number;
  dirigidoA: string;
  genero: string | null;
  codigoAutenticidad: string;
  planesExequiales: PlanExequialCertificado[];
  beneficiariosActivos: BeneficiarioCertificado[];
  personaSolicitud: "titular" | "beneficiario";
}) {

  const logoBase64 = fs.readFileSync(
    path.join(process.cwd(), "public", "certificados", "LOGO.png")
  ).toString("base64");
  
  const piePaginaBase64 = fs.readFileSync(
    path.join(process.cwd(), "public", "certificados", "PIEPAG.jpg")
  ).toString("base64");
  
  const logoUrl = `data:image/png;base64,${logoBase64}`;
  const piePaginaUrl = `data:image/jpeg;base64,${piePaginaBase64}`;

  const tratamiento =
  datos.genero?.trim().toUpperCase() === "M" ? " el señor" : "la señora";

  const identificadaTexto =
  datos.genero?.trim().toUpperCase() === "M" ? "identificado" : "identificada";

  const identificadaAfiliacion =
  datos.genero?.trim().toUpperCase() === "M" ? "afiliado" : "afiliada";

  const urlBaseValidacion =
  process.env.NEXT_PUBLIC_APP_URL || "https://test-autosolicitudes.cotrafasocial.com";

  const urlValidacion = `${urlBaseValidacion}/validar-documento?codigo=${encodeURIComponent(
    datos.codigoAutenticidad
  )}`;

  const qrCodigoAutenticidad = await QRCode.toDataURL(urlValidacion, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 120,
  });

  const normalizarProducto = (producto: string) => {
    return producto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  };
  
  const esAsistenciaGrupoFamiliarPrimario = datos.planesExequiales.some((plan) => {
    const productoNormalizado = normalizarProducto(plan.producto);
  
    return (
      productoNormalizado === "MI PLAN" ||
      productoNormalizado === "MI FAMILIA PRIMARIA"
    );
  });
  
  const debeMostrarMensajeGrupoPrimario =
    datos.personaSolicitud === "titular" && esAsistenciaGrupoFamiliarPrimario;

  const filasPlanesExequiales = datos.planesExequiales
  .map((plan) => {
    return `
      <tr>
        <td>${plan.contrato}</td>
        <td>${plan.producto}</td>
        <td>ACTIVO - Pagos al día</td>
      </tr>
    `;
  })
  .join("");


  const cantidadFilasTabla =
  datos.planesExequiales.length + datos.beneficiariosActivos.length;

  const modoCompacto = cantidadFilasTabla >= 6;

  const mensajeGrupoFamiliarPrimario = `
  <div class="family-note">
    Para esta asistencia, se consideran beneficiarios activos los integrantes del
    grupo familiar primario, previa demostración del parentesco. En el caso de los
    hijos, la cobertura estará vigente hasta los <strong>30 años de edad</strong>.
  </div>
`;

const filasBeneficiariosActivos =
  datos.beneficiariosActivos.length > 0
    ? datos.beneficiariosActivos
        .map((beneficiario) => {
          return `
            <tr>
              <td>${beneficiario.nombreCompleto}</td>
              <td>${beneficiario.documento}</td>
              <td>${beneficiario.parentesco}</td>
              <td>${beneficiario.fechaAfiliacion}</td>
            </tr>
          `;
        })
        .join("")
    : "";

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #4f4f4f;
          background: white;
        }

        .page {
          width: 8.5in;
          height: 11in;
          padding: 32px 74px 150px;
          position: relative;
          overflow: hidden;
        }

       .page.compact {
          padding-top: 32px;
          padding-bottom: 150px;
        }

        .logo-img {
          width: 135px;
          height: auto;
          display: block;
        }

        .line-blue {
          height: 3px;
          background: #002869;
          margin-top: 28px;
        }

        .line-orange {
          height: 1px;
          background: #f5a623;
          margin-top: 8px;
        }

        .title {
          margin-top: 22px;
          text-align: center;
          color: #111;
          font-weight: 700;
          font-size: 15px;
          line-height: 1.35;
        }

        .subtitle {
          margin-top: 18px;
          text-align: center;
          font-size: 13px;
          line-height: 1.5;
          color: #565656;
          text-transform: uppercase;
        }

        .certifica {
          margin-top: 8px;
          text-align: center;
          font-size: 13px;
          font-weight: 700;
          color: #333;
        }

        .recipient {
          margin-top: 22px;
          font-size: 12px;
          line-height: 1.45;
        }

        .content {
          margin-top: 18px;
          font-size: 12px;
          line-height: 1.58;
          text-align: justify;
        }

        .section-title {
          margin-top: 24px;
          color: #111;
          font-weight: 700;
          font-size: 13px;
        }

        .separator {
          height: 1px;
          background: #bfbfbf;
          margin-top: 12px;
          margin-bottom: 14px;
        }

        .details {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
        margin-top: 4px;
        }

        .details th {
        background: #f3f3f3;
        color: #333;
        font-weight: 700;
        border: 1px solid #d8d8d8;
        padding: 7px 6px;
        text-align: left;
        }

        .details td {
        border: 1px solid #d8d8d8;
        padding: 7px 6px;
        vertical-align: top;
        }

        .details .estado {
        font-weight: 700;
        color: #111;
        }

        .family-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
        margin-top: 4px;
        }

        .family-table th {
        background: #f3f3f3;
        color: #333;
        font-weight: 700;
        border: 1px solid #d8d8d8;
        padding: 7px 6px;
        text-align: left;
        }

        .family-table td {
        border: 1px solid #d8d8d8;
        padding: 7px 6px;
        vertical-align: top;
        }

        .family-note {
          margin-top: 4px;
          border: 1px solid #d8d8d8;
          background: #f9f9f9;
          padding: 10px 12px;
          font-size: 10.5px;
          line-height: 1.45;
          text-align: justify;
          color: #4f4f4f;
        }

       .page.compact .logo-img {
          width: 128px;
        }

        .page.compact .line-blue {
          margin-top: 22px;
        }

        .page.compact .line-orange {
          margin-top: 7px;
        }

        .page.compact .title {
          margin-top: 18px;
          font-size: 14px;
        }

        .page.compact .subtitle {
          margin-top: 14px;
          font-size: 12px;
        }

        .page.compact .certifica {
          margin-top: 7px;
          font-size: 12.5px;
        }

        .page.compact .recipient {
          margin-top: 18px;
          font-size: 11px;
        }

        .page.compact .content {
          margin-top: 14px;
          font-size: 11.2px;
          line-height: 1.45;
        }

        .page.compact .section-title {
          margin-top: 16px;
          font-size: 11.5px;
        }

        .page.compact .separator {
          margin-top: 8px;
          margin-bottom: 8px;
        }

        .page.compact .details,
        .page.compact .family-table {
          font-size: 9px;
        }

        .page.compact .details th,
        .page.compact .details td,
        .page.compact .family-table th,
        .page.compact .family-table td {
          padding: 5px 5px;
        }

        .page.compact .family-note {
          font-size: 9.2px;
          line-height: 1.35;
          padding: 7px 8px;
        }

        .page.compact .expedition {
          margin-top: 10px;
          font-size: 9.8px;
          line-height: 1.3;
        }

        .page.compact .signature-auth-row {
          margin-top: 8px;
        }

        .page.compact .signature {
          font-size: 10.2px;
          padding-top: 6px;
        }

        .page.compact .signature .cordialmente {
          margin-bottom: 16px;
        }

        .page.compact .signature .role {
          font-size: 9.8px;
        }

        .page.compact .signature .brand {
          font-size: 8.2px;
        }

        .page.compact .qr-auth {
          width: 60px;
          height: 60px;
        }

        .page.compact .auth-label {
          width: 60px;
          font-size: 8px;
        }

        .page.compact .data-note {
          font-size: 7.2px;
          line-height: 1.1;
          margin-bottom: 5px;
        }

        .page.compact .footer {
          bottom: 16px;
        }

        .page.compact .footer-img {
          width: 520px;
        }

        .expedition {
        margin-top: 22px;
        font-size: 11.5px;
        line-height: 1.55;
        text-align: justify;
        }

        .signature-auth-row {
        margin-top: 18px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        }

        .signature {
        width: 48%;
        font-size: 11.5px;
        line-height: 1.45;
        padding-top: 15px;
        }

        .signature .cordialmente {
        margin-bottom: 36px;
        color: #4f4f4f;
        }

        .signature .name {
        margin-top: 0;
        color: #002869;
        font-weight: 700;
        }

        .signature .role {
        color: #555;
        font-size: 11px;
        }

        .signature .brand {
        color: #f5a623;
        font-weight: 700;
        font-size: 9px;
        }

        .auth-code {
        width: 42%;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        color: #002869;
        font-size: 9px;
        font-weight: 700;
        }

        .qr-auth {
        width: 64px;
        height: 64px;
        }

        .auth-label {
          margin-top: 4px;
          line-height: 1.2;
          text-align: center;
          width: 64px;
        }

        .data-note {
        margin-bottom: 8px;
        font-size: 9px;
        line-height: 1.25;
        text-align: center;
        color: #777;
        font-weight: 400;
        }

        .footer {
        position: absolute;
        left: 74px;
        right: 74px;
        bottom: 20px;
        text-align: center;
        color: #002869;
        font-size: 6.8px;
        font-weight: 700;
        }

        .footer .line-blue {
        margin-top: 0;
        }

        .footer .line-orange {
        margin-bottom: 12px;
        }

        .footer-img {
        width: 540px;
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
        }
      </style>
    </head>

    <body>
      <div class="page ${modoCompacto ? "compact" : ""}">
        <img class="logo-img" src="${logoUrl}" alt="Cotrafa Social" />

        <div class="line-blue"></div>
        <div class="line-orange"></div>

        <div class="title">CERTIFICADO DE AFILIACIÓN</div>

        <div class="subtitle">
          LA EMPRESA COTRAFA DE SERVICIOS SOCIALES - COTRAFA SOCIAL
        </div>

        <div class="certifica">CERTIFICA QUE:</div>

        <div class="recipient">
          <strong>Señores:</strong><br />
          ${datos.dirigidoA}<br />
          Bello.
        </div>

        <div class="content">
          El(La) señor(a) <strong>${datos.nombre}</strong>, ${identificadaTexto} con
          ${datos.tipoIdentificacion} No. <strong>${datos.identificacion}</strong>,
          se encuentra ${identificadaAfiliacion} a Cotrafa Social en calidad de titular
          desde el año <strong>${datos.anioAfiliacion}</strong>.
        </div>

        <div class="section-title">1. DETALLES DEL CONTRATO</div>
        <div class="separator"></div>

        <table class="details">
            <thead>
                <tr>
                <th>Contrato</th>
                <th>Producto</th>
                <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                ${filasPlanesExequiales}
            </tbody>
            </table>

            <div class="section-title">2. GRUPO FAMILIAR BENEFICIARIO INSCRITO</div>
<div class="separator"></div>

${
  debeMostrarMensajeGrupoPrimario
    ? mensajeGrupoFamiliarPrimario
    : `
      <table class="family-table">
        <thead>
          <tr>
            <th>Nombre completo</th>
            <th>Documento de identidad</th>
            <th>Parentesco</th>
            <th>Fecha afiliación</th>
          </tr>
        </thead>
        <tbody>
          ${
            filasBeneficiariosActivos ||
            `
              <tr>
                <td colspan="4">No se encontraron beneficiarios activos asociados al contrato.</td>
              </tr>
            `
          }
        </tbody>
      </table>
    `
}

        <div class="expedition">
          Para constancia de lo anterior, se expide la presente certificación a solicitud
          del interesado, en el municipio de Bello, Antioquia, el día
          <strong>${obtenerFechaActualTexto()}</strong>.
        </div>

        <div class="signature-auth-row">
       <div class="signature">
            <div class="cordialmente">Cordialmente,</div>

            <div class="name">Didier Jaime Lopera Cardona</div>
            <div class="role">Gerente</div>
            <div class="brand">COTRAFA SOCIAL</div>
        </div>

        <div class="auth-code">
            <img class="qr-auth" src="${qrCodigoAutenticidad}" alt="Código de autenticidad" />
            <div class="auth-label">
                Código de autenticidad
            </div>
        </div>

        </div>

       <div class="footer">
        <div class="data-note">
            De conformidad con la Ley Estatutaria 1581 de 2012 de Protección de Datos Personales,
            la información aquí contenida es confidencial y ha sido emitida con la autorización
            expresa del titular para fines estrictamente institucionales y de validación ante terceros.
            Firmado digitalmente por Cotrafa Social.
        </div>

        <div class="line-blue"></div>
        <div class="line-orange"></div>
        <img class="footer-img" src="${piePaginaUrl}" alt="Pie de página Cotrafa Social" />
        </div>
      </div>
    </body>
  </html>
`;

  const browser = await puppeteer.launch(await obtenerConfiguracionPuppeteer());

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdfBytes = await page.pdf({
      format: "letter",
      printBackground: true,
      scale: 1.12,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

export async function POST(request: Request) {
  try {
    const {
      identificacion,
      dirigidoA,
      canal,
      personaCertificado,
      tipoDocumentoBeneficiario,
      documentoBeneficiario,
    } = await request.json();

    const canalSolicitud = canal === "correo" ? "correo" : "descargar";

    if (!identificacion || !String(identificacion).trim()) {
      return NextResponse.json(
        { ok: false, message: "Debe ingresar un número de documento." },
        { status: 400 }
      );
    }

    const personaSolicitud =
      personaCertificado === "beneficiario" ? "beneficiario" : "titular";

    if (personaSolicitud === "beneficiario") {
      if (!documentoBeneficiario || !String(documentoBeneficiario).trim()) {
        return NextResponse.json(
          {
            ok: false,
            message: "Debe ingresar el número de documento del beneficiario.",
          },
          { status: 400 }
        );
      }
    }

    const dirigidoATexto =
    typeof dirigidoA === "string" && dirigidoA.trim()
      ? dirigidoA.trim()
      : "A QUIEN PUEDA INTERESAR";

      const contratos = await consultarContratos(String(identificacion).trim());

const contratosExequialesVigentes =
  obtenerContratosExequialesVigentes(contratos);

const contratosEmpresarialesVigentes =
  obtenerContratosEmpresarialesVigentes(contratos);

if (
  contratosExequialesVigentes.length === 0 &&
  contratosEmpresarialesVigentes.length > 0
) {
        const datosTitularEmpresarial = obtenerDatosTitular(
          contratosEmpresarialesVigentes
        );
      
        if (
          !datosTitularEmpresarial.nombre ||
          !datosTitularEmpresarial.identificacion ||
          !datosTitularEmpresarial.tipoIdentificacion
        ) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "No fue posible obtener la información del titular para registrar la solicitud.",
            },
            { status: 422 }
          );
        }
      
        if (!datosTitularEmpresarial.email) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "No fue posible registrar la solicitud porque no hay correo registrado.",
            },
            { status: 422 }
          );
        }
      
        const codigoSolicitud = generarCodigoAutenticidad();
      
        const datosDocEmpresarial = JSON.stringify([
          {
            certificado: "Afiliación núcleo familiar",
            tipoSolicitud: "empresarial",
            canal: canalSolicitud,
            dirigidoA: dirigidoATexto,
            nombre: datosTitularEmpresarial.nombre,
            tipoIdentificacion: datosTitularEmpresarial.tipoIdentificacion,
            identificacion: datosTitularEmpresarial.identificacion,
            emailRegistrado: "SI",
            personaSolicitud,
            tipoDocumentoBeneficiario:
              personaSolicitud === "beneficiario" ? tipoDocumentoBeneficiario : null,
            documentoBeneficiario:
              personaSolicitud === "beneficiario"
                ? String(documentoBeneficiario).trim()
                : null,
            contratosEmpresariales: contratosEmpresarialesVigentes.map((contrato) => ({
              contrato: obtenerTexto(contrato.contrato) || "No disponible",
              nitGrupal: obtenerTexto(contrato.nit_grupal) || "No disponible",
              producto:
                obtenerTexto(contrato.nombre_producto) ||
                obtenerTexto(contrato.descripcion_producto) ||
                obtenerTexto(contrato.producto) ||
                "No disponible",
            })),
          },
        ]);
      
        await registrarSolicitudEnSheets({
          fechaCreacion: obtenerFechaRegistroTexto(),
          usuCreacion: String(identificacion).trim(),
          codigoDoc: codigoSolicitud,
          tipoDoc: "Afiliación núcleo familiar",
          quienNecesitaDoc:
            personaSolicitud === "beneficiario" ? "Beneficiario" : "Titular",
          dirigidoADoc: dirigidoATexto,
          datosDoc: datosDocEmpresarial,
        });

        const contratosTextoNivel2 = contratosEmpresarialesVigentes
          .map((contrato) => obtenerTexto(contrato.contrato))
          .filter(Boolean)
          .join(" / ");

        await registrarSolicitudNivel2Certificados({
          fechaSolicitud: obtenerFechaRegistroTexto(),
          contrato: contratosTextoNivel2,
          cedula:
            datosTitularEmpresarial.identificacion || String(identificacion).trim(),
          nombre: datosTitularEmpresarial.nombre,
          dirigidoA: dirigidoATexto,
          correo: datosTitularEmpresarial.email,
          codigoSolicitud,
          tipo: "Afiliación núcleo familiar",
          certificado:
          personaSolicitud === "beneficiario"
            ? `Certificado para beneficiario ${tipoDocumentoBeneficiario} ${String(
                documentoBeneficiario
              ).trim()}`
            : "Certificado para titular",
        });
      
        await enviarCorreoSolicitudEmpresarial({
          destinatario: datosTitularEmpresarial.email,
          nombre: datosTitularEmpresarial.nombre,
          identificacion:
            datosTitularEmpresarial.identificacion || String(identificacion).trim(),
          codigoSolicitud,
          tipoCertificado: "Afiliación con núcleo familiar",
        });
      
        return NextResponse.json(
          {
            ok: true,
            estado: "empresarial",
            message:
              "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles.",
            codigoSolicitud,
          },
          { status: 200 }
        );
      }
      
      
      if (contratosExequialesVigentes.length === 0) {
  return NextResponse.json(
    {
      ok: false,
      message: "No fue posible generar el certificado porque no se cumplen las condiciones requeridas.",
    },
    { status: 422 }
  );
}

const resultadoPlanes = await obtenerPlanesExequialesAlDia(
  contratos.filter((contrato) => contratoEsExequial(contrato)),
  String(identificacion).trim()
);

if (!resultadoPlanes.estaAlDia) {
  const datosTitularMoroso = obtenerDatosTitular(contratosExequialesVigentes);

  const contratosMorososTexto = resultadoPlanes.contratosMorosos
    .map((contrato) => contrato.contrato)
    .filter(Boolean)
    .join(" / ");

  const productosMorososTexto = resultadoPlanes.contratosMorosos
    .map((contrato) => contrato.producto)
    .filter(Boolean)
    .join(" / ");

  const datosDocMoroso = JSON.stringify([
    {
      certificado: "Afiliación núcleo familiar",
      estado: "moroso",
      motivo:
        "No fue posible generar el certificado automáticamente porque el titular presenta cartera pendiente.",
      canal: canalSolicitud,
      dirigidoA: dirigidoATexto,
      titular: {
        nombre: datosTitularMoroso.nombre || "Afiliado",
        identificacion:
          datosTitularMoroso.identificacion || String(identificacion).trim(),
        emailRegistrado: datosTitularMoroso.email ? "SI" : "NO",
      },
      personaSolicitud,
      tipoDocumentoBeneficiario:
        personaSolicitud === "beneficiario" ? tipoDocumentoBeneficiario : null,
      documentoBeneficiario:
        personaSolicitud === "beneficiario"
          ? String(documentoBeneficiario).trim()
          : null,
      contratosMorosos: resultadoPlanes.contratosMorosos,
      contratos: contratosMorososTexto,
      productos: productosMorososTexto,
    },
  ]);

  await registrarSolicitudEnSheets({
    fechaCreacion: obtenerFechaRegistroTexto(),
    usuCreacion: String(identificacion).trim(),
    codigoDoc: "NO GENERADO POR MORA",
    tipoDoc: "Afiliación núcleo familiar",
    quienNecesitaDoc:
      personaSolicitud === "beneficiario" ? "Beneficiario" : "Titular",
    dirigidoADoc: dirigidoATexto,
    datosDoc: datosDocMoroso,
  });

  if (canalSolicitud === "correo" && datosTitularMoroso.email) {
    await enviarCorreoContratosMorosos({
      destinatario: datosTitularMoroso.email,
      nombre: datosTitularMoroso.nombre || "Afiliado",
      identificacion:
        datosTitularMoroso.identificacion || String(identificacion).trim(),
      contratosMorosos: resultadoPlanes.contratosMorosos,
    });

    return NextResponse.json(
      {
        ok: true,
        estado: "moroso",
        message:
          "Tu solicitud fue recibida\nHemos enviado información detallada al correo electrónico registrado.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      estado: "moroso",
      message:
        "No fue posible generar el certificado porque no se cumplen las condiciones requeridas.",
    },
    { status: 422 }
  );
}

const planesExequiales = resultadoPlanes.planes;
const beneficiariosActivos = resultadoPlanes.beneficiarios;

let beneficiariosParaCertificado = beneficiariosActivos;

if (personaSolicitud === "beneficiario") {
  const documentoBeneficiarioNormalizado = normalizarDocumento(
    String(documentoBeneficiario).trim()
  );

  const beneficiarioEncontrado = beneficiariosActivos.find(
    (beneficiario) =>
      beneficiario.documentoNormalizado === documentoBeneficiarioNormalizado
  );

  if (!beneficiarioEncontrado) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "La identificación ingresada no corresponde a un beneficiario activo del contrato.",
      },
      { status: 422 }
    );
  }

  beneficiariosParaCertificado = [beneficiarioEncontrado];
}

const datosTitular = obtenerDatosTitular(contratosExequialesVigentes);

    if (
      !datosTitular.nombre ||
      !datosTitular.tipoIdentificacion ||
      !datosTitular.identificacion ||
      !datosTitular.anioAfiliacion
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "No fue posible obtener la información para generar el certificado.",
        },
        { status: 422 }
      );
    }

    const codigoAutenticidad = generarCodigoAutenticidad();

const aniosAfiliado = datosTitular.anioAfiliacion
  ? new Date().getFullYear() - datosTitular.anioAfiliacion
  : null;

  const datosDoc = JSON.stringify([
    {
      certificado: "Afiliación núcleo familiar",
      canal: canalSolicitud,
      dirigidoA: dirigidoATexto,
      nombre: datosTitular.nombre,
      tipoIdentificacion: datosTitular.tipoIdentificacion,
      identificacion: datosTitular.identificacion,
      anioAfiliacion: datosTitular.anioAfiliacion,
      tiempoQueLleva: aniosAfiliado,
      genero: datosTitular.genero,
      emailRegistrado: datosTitular.email ? "SI" : "NO",
      planesExequiales,
      personaSolicitud,
      tipoDocumentoBeneficiario:
        personaSolicitud === "beneficiario" ? tipoDocumentoBeneficiario : null,
      documentoBeneficiario:
        personaSolicitud === "beneficiario"
          ? String(documentoBeneficiario).trim()
          : null,
      beneficiariosActivos: beneficiariosParaCertificado,
    },
  ]);

const cantidadSolicitudesHoy = await contarSolicitudesAfiliacionNucleoHoy(
    String(identificacion).trim()
  );
  
  if (cantidadSolicitudesHoy >= LIMITE_DIARIO_AFILIACION_NUCLEO) {
  return NextResponse.json(
    {
      ok: false,
      message:
         "No fue posible generar el certificado porque ya alcanzaste el límite diario permitido para este documento.",
    },
    { status: 429 }
  );
}

await registrarSolicitudEnSheets({
    fechaCreacion: obtenerFechaRegistroTexto(),
    usuCreacion: String(identificacion).trim(),
    codigoDoc: codigoAutenticidad,
    tipoDoc: "Afiliación núcleo familiar",
    quienNecesitaDoc:
      personaSolicitud === "beneficiario" ? "Beneficiario" : "Titular",
    dirigidoADoc: dirigidoATexto,
    datosDoc,
  });

  const pdfBytes = await generarPdfAfiliacionNucleo({
    nombre: datosTitular.nombre,
    tipoIdentificacion: datosTitular.tipoIdentificacion,
    identificacion: datosTitular.identificacion,
    anioAfiliacion: datosTitular.anioAfiliacion,
    dirigidoA: dirigidoATexto,
    genero: datosTitular.genero,
    codigoAutenticidad,
    planesExequiales,
    beneficiariosActivos: beneficiariosParaCertificado,
    personaSolicitud,
  });

    if (canalSolicitud === "correo") {
      if (!datosTitular.email) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "No fue posible enviar el certificado porque no hay correo registrado.",
          },
          { status: 422 }
        );
      }
    
      await enviarCertificadoPorCorreo({
        destinatario: datosTitular.email,
        pdfBytes,
        codigoAutenticidad,
        nombreAfiliado: datosTitular.nombre || "Afiliado",
        nombreCertificado: "Afiliación con Núcleo Familiar",
      });
    
      return NextResponse.json(
        {
          ok: true,
          estado: "al-dia",
          message:
            "Tu certificado está listo y ya fue enviado al correo electrónico registrado.",
        },
        { status: 200 }
      );
    }

    const pdfArrayBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength
      ) as ArrayBuffer;
      
      return new NextResponse(pdfArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="certificado-afiliacion-nucleo-familiar.pdf"',
          "Cache-Control": "no-store",
        },
      });
      
    } catch (error) {
        console.error("Error generando certificado afiliación núcleo:", error);
    
      return NextResponse.json(
        {
          ok: false,
          message: "No fue posible generar el certificado en este momento.",
        },
        { status: 500 }
      );
    }
}