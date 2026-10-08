import { NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";



export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContratoKaring = Record<string, unknown>;

type PlanExequialSolicitud = {
  contrato: string;
  producto: string;
};

type ContratoMoroso = {
  contrato: string;
  producto: string;
  cantidadRegistrosCartera: number;
};

type FallecidoSolicitud = {
  nombreCompleto: string;
  identificacion: string;
  fechaFallecimiento: string;
};

const CORREO_INTERNO_GASTOS_FISICO =
  process.env.CORREO_INTERNO_GASTOS_FISICO || "analistati@cotrafasocial.com.co";


type OrdenServicioKaring = Record<string, unknown>;

type ServicioOrden = {
  categoria: string;
  nombre: string;
  valorUnitario: number;
  cantidad: number;
  basico: number;
  excedente: number;
};

function escaparHtml(valor: string | null | undefined) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatearMoneda(valor: unknown) {
  const numero = obtenerNumero(valor) || 0;

  return numero.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatearFechaLarga(fechaTexto: string | null) {
  if (!fechaTexto) {
    return "";
  }

  const fechaLimpia = fechaTexto.trim();
  const coincidenciaIso = fechaLimpia.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!coincidenciaIso) {
    return "";
  }

  const [, anio, mes, dia] = coincidenciaIso;
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));

  return fecha.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function obtenerNombreServicio(codigoServicio: string | null) {
  const servicios: Record<string, string> = {
    "1": "DESTINO FINAL DEL CUERPO INHUMACIÓN",
    "2": "DESTINO FINAL DEL CUERPO CREMACIÓN",
    "3": "SALA DE VELACIÓN COTRAFA SOCIAL",
    "4": "SALA DE VELACIÓN TERCEROS",
    "5": "SALA DE VELACIÓN HORAS EXTRAS COTRAFA SOCIAL",
    "6": "SALA DE VELACIÓN HORAS EXTRAS TERCEROS",
    "7": "AVISOS MURALES (CARTELES)",
    "8": "VELONES",
    "9": "CONTENEDOR PARA CREMACIÓN",
    "12": "TRASLADOS RURALES",
    "13": "PREPARACIÓN DEL CUERPO (TANATOPRAXIA)",
    "14": "TRÁMITES LEGALES",
    "15": "SUMINISTRO DE CARROZA FÚNEBRE",
    "16": "RECORDATORIOS - CINTA",
    "17": "CORTEJO FÚNEBRE",
    "18": "SERVICIOS BÁSICOS FUNERARIOS",
    "19": "TRÁMITES ECLESIÁSTICOS EXEQUIAS",
    "20": "ACOMPAÑAMIENTO MUSICAL",
    "21": "TRANSPORTE ACOMPAÑANTES (BUSES)",
    "22": "VEHÍCULOS ADICIONALES",
    "23": "TRASLADO DEL CUERPO (URBANO)",
    "24": "TRASLADO DEL CUERPO (NACIONAL)",
    "25": "ARREGLOS FLORALES (BÁSICO)",
    "26": "ARREGLOS FLORALES (ESPECIAL)",
    "27": "ARREGLO FLORAL (YUGO)",
    "28": "YUGO ARTIFICIAL",
    "29": "SERVICIOS HUELLAS DE VIDA",
    "34": "CREMACIÓN DE RESTOS",
    "74": "COFRE FÚNEBRE EN ARRIENDO",
    "75": "COFRE FÚNEBRE EN VENTA",
    "76": "URNAS",
    "77": "HÁBITOS",
    "78": "SERVICIOS FUNERARIOS DE TERCEROS",
    "79": "CENIZARIO Y OSARIO",
    "80": "RECONOCIMIENTOS",
    "81": "COFRE TERCEROS",
    "82": "INICIALES TERCEROS",
    "83": "URNA TERCEROS",
    "84": "AUTORIZACIONES",
    "85": "CUSTODIA COTRAFA SOCIAL",
    "86": "CUSTODIA TERCEROS",
    "87": "SERVICIO FUNERARIO MASCOTA",
    "88": "INHUMACIÓN HORA EXTRA",
    "89": "REPATRIACIÓN Y/O EXPATRIACIÓN",
    "90": "URNA PARA MASCOTAS",
    "91": "CREMACIÓN MASCOTAS",
    "92": "BOLSA CENIZA",
    "93": "INICIALES TERCEROS MASCOTAS",
    "94": "VELAS PARA MASCOTAS",
    "999": "SERVICIOS FUNERARIOS",
  };

  if (!codigoServicio) {
    return "SERVICIO FUNERARIO";
  }

  return servicios[codigoServicio] || `SERVICIO ${codigoServicio}`;
}

function obtenerCategoriaServicio(codigoServicio: string | null) {
  const codigo = String(codigoServicio || "").trim();

  const codigosDestinoFinal = new Set([
    "1",
    "2",
    "34",
    "79",
    "88",
    "91",
  ]);

  const codigosComplementarios = new Set([
    "7",
    "8",
    "9",
    "12",
    "16",
    "19",
    "20",
    "21",
    "22",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "74",
    "75",
    "76",
    "77",
    "78",
    "80",
    "81",
    "82",
    "83",
    "84",
    "85",
    "86",
    "87",
    "89",
    "90",
    "92",
    "93",
    "94",
  ]);

  if (codigosDestinoFinal.has(codigo)) {
    return "DESTINO FINAL";
  }

  if (codigosComplementarios.has(codigo)) {
    return "SERVICIOS COMPLEMENTARIOS";
  }

  return "SERVICIOS BÁSICOS";
}

function extraerPrimerFallecidoOrden(datosOrden: OrdenServicioKaring) {
  const fallecidos = datosOrden.fallecidos;

  if (!Array.isArray(fallecidos) || fallecidos.length === 0) {
    return null;
  }

  const fallecido = fallecidos[0];

  if (
    !fallecido ||
    typeof fallecido !== "object" ||
    Array.isArray(fallecido)
  ) {
    return null;
  }

  return fallecido as Record<string, unknown>;
}

function extraerServiciosOrden(datosOrden: OrdenServicioKaring): ServicioOrden[] {
  const detalle = datosOrden.detalle;

  if (!Array.isArray(detalle)) {
    return [];
  }

  return detalle
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const servicio = item as Record<string, unknown>;
      const codigoServicio = obtenerTexto(servicio.servicio);
      const cantidad = obtenerNumero(servicio.cantidad) || 0;
      const basico = obtenerNumero(servicio.valor_convenio) || 0;
      const excedente = obtenerNumero(servicio.valor_excedente) || 0;
      const valorUnitario = cantidad > 0 ? basico / cantidad : basico;

      return {
        categoria: obtenerCategoriaServicio(codigoServicio),
        nombre: obtenerNombreServicio(codigoServicio),
        valorUnitario,
        cantidad,
        basico,
        excedente,
      };
    })
    .filter((servicio) => {
      return servicio.basico > 0 || servicio.excedente > 0 || servicio.cantidad > 0;
    });
}

async function buscarOrdenServicioPorCedulaFallecido(cedulaFallecido: string) {
  const spreadsheetId = process.env.GOOGLE_SHEET_SERVICIOS_AUTO_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_SERVICIOS_AUTO_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Servicios'!C:D",
  });

  const filas = respuesta.data.values || [];
  const documentoBuscado = normalizarDocumento(cedulaFallecido);

  for (const fila of filas) {
    const ordenServicio = String(fila[0] || "").trim();
    const documentoFallecido = normalizarDocumento(String(fila[1] || ""));

    if (!ordenServicio || !documentoFallecido) {
      continue;
    }

    if (documentoFallecido === documentoBuscado) {
      return ordenServicio;
    }
  }

  return null;
}

async function consultarOrdenServicioKaring(ordenServicio: string) {
  const ordenServicioUrl = process.env.KARING_ORDEN_SERVICIO_URL;

  if (!ordenServicioUrl) {
    throw new Error("Falta KARING_ORDEN_SERVICIO_URL.");
  }

  const token = await obtenerToken();

  const urlConsulta = new URL(ordenServicioUrl);
  urlConsulta.searchParams.set("_orden_servicio", ordenServicio);

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": token,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    },
  });

  if (!response.ok) {
    throw new Error("No fue posible consultar la orden de servicio.");
  }

  const textoRespuesta = await response.text();

  try {
    return JSON.parse(textoRespuesta) as OrdenServicioKaring;
  } catch {
    throw new Error("La respuesta de la orden de servicio no tiene formato JSON válido.");
  }
}

function generarCodigoAutenticidadGastos() {
  const fecha = new Date();
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `CS-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
}



const PRODUCTOS_EXEQUIALES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  13, 14, 15, 16, 17, 18, 19, 20,
  481, 482, 483, 484, 485, 486, 487, 489, 490, 491, 492, 493, 494, 495,
  496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509,
  510, 511, 512, 513, 514, 515, 628, 734, 1804, 1805, 1894, 1895, 1896,
  1898, 1899, 1900, 1903,
]);

const PRODUCTOS_MI_PLAN = new Set([510, 511]);

function contratoEsMiPlan(contrato: ContratoKaring) {
  const productoPrevision = obtenerNumero(contrato.producto_prevision);

  if (productoPrevision !== null && PRODUCTOS_MI_PLAN.has(productoPrevision)) {
    return true;
  }

  const textoProducto = [
    obtenerTexto(contrato.nombre_producto),
    obtenerTexto(contrato.descripcion_producto),
    obtenerTexto(contrato.producto),
    obtenerTexto(contrato.descripcion_grupal),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    textoProducto.includes("MI PLAN") ||
    textoProducto.includes("MI FAMILIA PRIMARIA")
  );
}

function obtenerContratosMiPlanVigentes(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return contratoEstaVigente(contrato) && contratoEsMiPlan(contrato);
  });
}

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

function obtenerContratosEmpresarialesActivos(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return (
      contratoTieneActionActiva(contrato) &&
      contratoEstaVigente(contrato) &&
      contratoEsEmpresarial(contrato)
    );
  });
}

function obtenerContratosExequiales(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return contratoEstaVigente(contrato) && contratoEsExequial(contrato);
  });
}

function contratoTieneCartera(contrato: ContratoKaring) {
    const carteraControl = contrato.cartera_control;
  
    if (!Array.isArray(carteraControl)) {
      return false;
    }
  
    return carteraControl.length > 0;
  }
  
  function obtenerCantidadCartera(contrato: ContratoKaring) {
    const carteraControl = contrato.cartera_control;
  
    if (!Array.isArray(carteraControl)) {
      return 0;
    }
  
    return carteraControl.length;
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
  
  function formatearFechaCorta(fechaTexto: string | null) {
    if (!fechaTexto) {
      return "";
    }
  
    const fechaLimpia = fechaTexto.trim();
  
    const coincidenciaIso = fechaLimpia.match(/^(\d{4})-(\d{2})-(\d{2})/);
  
    if (coincidenciaIso) {
      const [, anio, mes, dia] = coincidenciaIso;
      return `${dia}/${mes}/${anio}`;
    }
  
    const coincidenciaLatina = fechaLimpia.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  
    if (coincidenciaLatina) {
      const [, dia, mes, anio] = coincidenciaLatina;
      return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${anio}`;
    }
  
    return "";
  }
  
  function obtenerFallecidoDesdeDetalle(
    detalleContrato: unknown,
    documentoFallecido: string,
    identificacionTitular: string
  ): FallecidoSolicitud | null {
    if (
      !detalleContrato ||
      typeof detalleContrato !== "object" ||
      Array.isArray(detalleContrato)
    ) {
      return null;
    }
  
    const asegurados = (detalleContrato as Record<string, unknown>).asegurados;
  
    if (!Array.isArray(asegurados)) {
      return null;
    }
  
    const documentoBuscado = normalizarDocumento(documentoFallecido);
  
    const coincidencias = asegurados.filter((asegurado) => {
      if (
        !asegurado ||
        typeof asegurado !== "object" ||
        Array.isArray(asegurado)
      ) {
        return false;
      }
  
      const persona = asegurado as Record<string, unknown>;
  
      const identificacion = obtenerTexto(persona.identificacion);
      const fechaFallecio = obtenerTexto(persona.fecha_fallecio);
  
      if (!identificacion) {
        return false;
      }
  
      if (normalizarDocumento(identificacion) !== documentoBuscado) {
        return false;
      }
  
      return Boolean(fechaFallecio);
    });
  
    if (coincidencias.length === 0) {
      return null;
    }
  
    const registro = coincidencias[coincidencias.length - 1] as Record<
      string,
      unknown
    >;
  
    const nombreCompleto = obtenerNombreCompletoPersona(registro);
    const identificacion = obtenerTexto(registro.identificacion);
    const fechaFallecio = obtenerTexto(registro.fecha_fallecio);
  
    if (!nombreCompleto || !identificacion || !fechaFallecio) {
      return null;
    }
  
    return {
      nombreCompleto,
      identificacion,
      fechaFallecimiento: formatearFechaCorta(fechaFallecio),
    };
  }
  
  async function obtenerFallecidoEnContratos(params: {
    contratosExequiales: ContratoKaring[];
    identificacionTitular: string;
    documentoFallecido: string;
  }) {
    const token = await obtenerToken();
  
    for (const contrato of params.contratosExequiales) {
      const numeroContrato = obtenerTexto(contrato.contrato);
  
      if (!numeroContrato) {
        continue;
      }
  
      const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);
  
      const fallecido = obtenerFallecidoDesdeDetalle(
        detalleContrato,
        params.documentoFallecido,
        params.identificacionTitular
      );
  
      if (!fallecido) {
        continue;
      }
  
      return fallecido;
    }
  
    return null;
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

function obtenerDatosTitular(contratos: ContratoKaring[]) {
  const contratoBase = contratos[0];

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
    email: obtenerTexto(contratoBase?.email),
  };
}

async function obtenerToken() {
  const authUrl = process.env.KARING_AUTH_URL;
  const usuario = process.env.KARING_USER;
  const clave = process.env.KARING_PASSWORD;

  if (!authUrl || !usuario || !clave) {
    throw new Error("Faltan variables de entorno de autenticación Karing.");
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
    throw new Error("No fue posible autenticar en Karing.");
  }

  const token = textoRespuesta.replace(/^"|"$/g, "").trim();

  if (!token) {
    throw new Error("Karing autenticó, pero no devolvió token.");
  }

  return token;
}

async function consultarContratos(identificacion: string) {
  const contratosUrl = process.env.KARING_CONTRATOS_URL;

  if (!contratosUrl) {
    throw new Error("Falta configurar KARING_CONTRATOS_URL.");
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
    throw new Error("Falta configurar KARING_CONTRATO_URL.");
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

async function obtenerPlanesExequiales(contratosExequiales: ContratoKaring[]) {
  const token = await obtenerToken();
  const planes: PlanExequialSolicitud[] = [];

  for (const contrato of contratosExequiales) {
    const numeroContrato = obtenerTexto(contrato.contrato);

    if (!numeroContrato) {
      continue;
    }

    const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);

    planes.push({
      contrato: numeroContrato,
      producto: obtenerNombreProductoDesdeDetalle(detalleContrato),
    });
  }

  return planes;
}

async function obtenerContratosMorosos(contratosExequiales: ContratoKaring[]) {
    const token = await obtenerToken();
    const contratosMorosos: ContratoMoroso[] = [];
  
    for (const contrato of contratosExequiales) {
      const numeroContrato = obtenerTexto(contrato.contrato);
  
      if (!numeroContrato) {
        continue;
      }
  
      if (!contratoTieneCartera(contrato)) {
        continue;
      }
  
      const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);
  
      contratosMorosos.push({
        contrato: numeroContrato,
        producto: obtenerNombreProductoDesdeDetalle(detalleContrato),
        cantidadRegistrosCartera: obtenerCantidadCartera(contrato),
      });
    }
  
    return contratosMorosos;
  }

function generarCodigoSolicitud() {
  const fecha = new Date();

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `GAS-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
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

async function registrarSolicitudNivel2CertificadoGastos(datos: {
  fechaSolicitud: string;
  lugarRetiro: string;
  cedulaTitular: string;
  nombreTitular: string;
  cedulaFallecido: string;
  nombreFallecido: string;
  fechaFallecimiento: string;
  dirigidoA: string;
  observacion: string;
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
    range: "'8. Certificado de gastos'!A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaSolicitud,
          "APLICATIVO WEB",
          datos.lugarRetiro,
          "",
          datos.cedulaTitular,
          datos.nombreTitular,
          datos.cedulaFallecido,
          datos.nombreFallecido,
          datos.fechaFallecimiento,
          "",
          datos.dirigidoA,
          datos.observacion,
        ],
      ],
    },
  });
}

async function generarPdfCertificadoGastosAutomatico(datos: {
  dirigidoA: string;
  codigoAutenticidad: string;
  ordenServicio: string;
  nombreTitular: string;
  identificacionTitular: string;
  contrato: string;
  nombreFallecido: string;
  identificacionFallecido: string;
  fechaFallecimiento: string;
  fechaServicio: string;
  servicios: ServicioOrden[];
}) {
  const logoPath = path.join(
    process.cwd(),
    "public",
    "certificados",
    "LOGO.png"
  );

  const piePaginaPath = path.join(
    process.cwd(),
    "public",
    "certificados",
    "PIEPAG.jpg"
  );

  const urlBaseValidacion =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  const urlValidacion = `${urlBaseValidacion}/validar-documento?codigo=${encodeURIComponent(
    datos.codigoAutenticidad
  )}`;

  const qrDataUrl = await QRCode.toDataURL(urlValidacion, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 120,
  });

  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
  const qrBuffer = Buffer.from(qrBase64, "base64");

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 36,
    bufferPages: true,
  });

  const chunks: Uint8Array[] = [];

  doc.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });

  const pdfFinalizado = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const anchoPagina = doc.page.width;
  const margen = 36;
  const anchoContenido = anchoPagina - margen * 2;

  function dibujarEncabezado() {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margen, 32, { width: 88 });
    }

    doc
      .moveTo(margen, 145)
      .lineTo(anchoPagina - margen, 145)
      .lineWidth(2)
      .strokeColor("#002869")
      .stroke();

    doc
      .moveTo(margen, 154)
      .lineTo(anchoPagina - margen, 154)
      .lineWidth(1)
      .strokeColor("#f5a623")
      .stroke();

    doc.strokeColor("#000000");
  }

  function dibujarPiePagina() {
    const yBase = doc.page.height - 92;

    doc
      .fontSize(6.5)
      .fillColor("#555555")
      .text(
        "De conformidad con la Ley Estatutaria 1581 de 2012 de Protección de Datos Personales, la información aquí contenida es confidencial y ha sido emitida con la autorización expresa del titular para fines estrictamente institucionales y de validación ante terceros.",
        margen,
        yBase,
        {
          width: anchoContenido,
          align: "center",
        }
      );

    doc
      .moveTo(margen, yBase + 22)
      .lineTo(anchoPagina - margen, yBase + 22)
      .lineWidth(2)
      .strokeColor("#002869")
      .stroke();

    doc
      .moveTo(margen, yBase + 32)
      .lineTo(anchoPagina - margen, yBase + 32)
      .lineWidth(1)
      .strokeColor("#f5a623")
      .stroke();

    if (fs.existsSync(piePaginaPath)) {
      doc.image(piePaginaPath, margen + 95, yBase + 42, {
        width: anchoContenido - 190,
      });
    }

    doc.strokeColor("#000000").fillColor("#000000");
  }

  function verificarEspacio(altoNecesario: number) {
    if (doc.y + altoNecesario > doc.page.height - 125) {
      dibujarPiePagina();
      doc.addPage();
      dibujarEncabezado();
      doc.y = 178;
    }
  }

  function dibujarTabla(categoria: string, servicios: ServicioOrden[]) {
    if (servicios.length === 0) {
      return;
    }
  
    const x = margen;
    const widths = [220, 75, 60, 85, 100];
    const altoEncabezado = 18;
    const altoFila = 17;
  
    function dibujarEncabezadoTabla() {
      verificarEspacio(altoEncabezado + altoFila);
  
      const y = doc.y + 10;
  
      doc.font("Helvetica-Bold").fontSize(6.7).fillColor("#333333");
  
      doc.rect(x, y, anchoContenido, altoEncabezado).fillAndStroke("#eeeeee", "#333333");
  
      doc.fillColor("#333333");
      doc.text(categoria, x + 6, y + 6, { width: widths[0] - 12 });
      doc.text("VR. UNITARIO", x + widths[0], y + 6, {
        width: widths[1],
        align: "center",
      });
      doc.text("CANTIDAD", x + widths[0] + widths[1], y + 6, {
        width: widths[2],
        align: "center",
      });
      doc.text("BÁSICO", x + widths[0] + widths[1] + widths[2], y + 6, {
        width: widths[3],
        align: "center",
      });
      doc.text(
        "EXCEDENTE",
        x + widths[0] + widths[1] + widths[2] + widths[3],
        y + 6,
        {
          width: widths[4],
          align: "center",
        }
      );
  
      doc.y = y + altoEncabezado;
    }
  
    dibujarEncabezadoTabla();
  
    doc.font("Helvetica").fontSize(6.8);
  
    for (const servicio of servicios) {
      if (doc.y + altoFila > doc.page.height - 128) {
        dibujarPiePagina();
        doc.addPage();
        dibujarEncabezado();
        doc.y = 165;
        dibujarEncabezadoTabla();
        doc.font("Helvetica").fontSize(6.8);
      }
  
      const y = doc.y;
  
      doc.rect(x, y, anchoContenido, altoFila).strokeColor("#999999").stroke();
  
      doc.fillColor("#333333");
      doc.text(servicio.nombre, x + 6, y + 5, { width: widths[0] - 12 });
  
      doc.text(formatearMoneda(servicio.valorUnitario), x + widths[0], y + 5, {
        width: widths[1] - 6,
        align: "right",
      });
  
      doc.text(
        formatearMoneda(servicio.cantidad),
        x + widths[0] + widths[1],
        y + 5,
        {
          width: widths[2] - 6,
          align: "right",
        }
      );
  
      doc.text(
        formatearMoneda(servicio.basico),
        x + widths[0] + widths[1] + widths[2],
        y + 5,
        {
          width: widths[3] - 6,
          align: "right",
        }
      );
  
      doc.text(
        formatearMoneda(servicio.excedente),
        x + widths[0] + widths[1] + widths[2] + widths[3],
        y + 5,
        {
          width: widths[4] - 6,
          align: "right",
        }
      );
  
      doc.y = y + altoFila;
    }
  
    doc.x = margen;
    doc.moveDown(0.4);
  }

  dibujarEncabezado();

  doc.y = 185;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111111")
    .text(`Bello, ${formatearFechaLarga(new Date().toISOString())}`, margen, doc.y);

  doc.moveDown(2);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("LA EMPRESA COTRAFA DE SERVICIOS SOCIALES", {
      width: anchoContenido,
      align: "center",
    });

  doc.moveDown(0.7);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("CERTIFICA QUE:", {
      width: anchoContenido,
      align: "center",
    });

  doc.moveDown(1.4);

  doc.font("Helvetica").fontSize(10.5).fillColor("#333333");

  doc.text(
    `Prestó el servicio funerario del(a) señor(a) ${datos.nombreFallecido}, identificado(a) con cédula de ciudadanía No. ${datos.identificacionFallecido}, fallecido(a) el día ${datos.fechaFallecimiento}, mediante el contrato exequial No. ${datos.contrato}, a nombre del(a) señor(a) ${datos.nombreTitular}, identificado(a) con cédula de ciudadanía No. ${datos.identificacionTitular}.`,
    {
      width: anchoContenido,
      align: "justify",
      lineGap: 2,
    }
  );

  doc.moveDown(0.8);

  doc.text(
    `El servicio se prestó el día ${datos.fechaServicio}, según Orden de Servicios No. ${datos.ordenServicio}, con las siguientes características:`,
    {
      width: anchoContenido,
      align: "justify",
      lineGap: 2,
    }
  );
  
  doc.moveDown(0.3);
  
  doc.font("Helvetica-Bold").fontSize(8.5).text(
    `Dirigido a: ${datos.dirigidoA}`,
    {
      width: anchoContenido,
      align: "left",
    }
  );
  
  doc.moveDown(0.3);

  const serviciosBasicos = datos.servicios.filter(
    (servicio) => servicio.categoria === "SERVICIOS BÁSICOS"
  );

  const serviciosComplementarios = datos.servicios.filter(
    (servicio) => servicio.categoria === "SERVICIOS COMPLEMENTARIOS"
  );

  const destinoFinal = datos.servicios.filter(
    (servicio) => servicio.categoria === "DESTINO FINAL"
  );

  dibujarTabla("SERVICIOS BÁSICOS", serviciosBasicos);
  dibujarTabla("SERVICIOS COMPLEMENTARIOS", serviciosComplementarios);
  dibujarTabla("DESTINO FINAL", destinoFinal);
  
  doc.x = margen;
  verificarEspacio(90);

  doc.x = margen;
  doc.moveDown(0.4);

  doc.font("Helvetica").fontSize(7.8).fillColor("#333333");

  doc.text(
    "El Ministerio de Protección Social a través de su oficina jurídica y de apoyo legislativo conceptúa que: El certificado de gastos expedido por la entidad que prestó los servicios funerarios se considera como documento válido para solicitar el pago del auxilio funerario cuando existe un contrato preexequial. (Comunicado 003391 de 16 de marzo de 2005).",
    {
      width: anchoContenido,
      align: "justify",
      lineGap: 1,
    }
  );

  doc.moveDown(0.6);

  doc.text(
    "Cuando el occiso o sus familiares hayan tomado un Contrato preexequial, se debe tener por documento válido para los efectos previstos la certificación de gastos expedida por la entidad que prestó el servicio de exequias.",
    {
      width: anchoContenido,
      align: "justify",
      lineGap: 1,
    }
  );

  doc.moveDown(0.6);

  doc.text(
    "Igualmente, en la medida en que el servicio funerario es una actividad de comercio sujeta a las disposiciones tributarias, se debe expedir factura de venta o su documento equivalente, en los términos del artículo 617 del estatuto tributario.",
    {
      width: anchoContenido,
      align: "justify",
      lineGap: 1,
    }
  );

// Bloque final compacto: solo crea otra página si realmente no cabe.
if (doc.y > doc.page.height - 175) {
  dibujarPiePagina();
  doc.addPage();
  dibujarEncabezado();
  doc.y = 178;
}

doc.x = margen;
doc.moveDown(1);

const yBloqueFinal = doc.y;

doc.font("Helvetica-Bold").fontSize(8).fillColor("#333333").text(
  "CARTERA SERVICIOS FUNERARIOS",
  margen + 350,
  yBloqueFinal,
  {
    width: anchoContenido - 350,
    align: "right",
  }
);

doc.x = margen;
doc.font("Helvetica-Bold").fontSize(7.5).text("Nota", margen, yBloqueFinal + 18);

doc.x = margen;
doc.font("Helvetica").fontSize(7.1).text(
  "De conformidad con el ART 111 de la ley 795 de 2003, se enuncian en un único ítem los SERVICIOS BÁSICOS FUNERARIOS: traslado del cuerpo, tanatopraxia o preparación del cuerpo, coche fúnebre, tarjetas de agradecimiento, cinta impresa, personal para el cortejo, cuatro vehículos para la familia, trámites legales, registro civil o eclesiástico y libro para registro de asistencia.",
  margen,
  yBloqueFinal + 30,
  {
    width: anchoContenido - 105,
    align: "justify",
    lineGap: 1,
  }
);

const yFirma = Math.max(doc.y + 24, yBloqueFinal + 105);

doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#002869").text(
  "Didier Jaime Lopera Cardona",
  margen,
  yFirma,
  {
    underline: true,
  }
);

doc.font("Helvetica").fontSize(8.5).fillColor("#333333").text(
  "Gerente",
  margen,
  yFirma + 13
);

doc.image(qrBuffer, anchoPagina - margen - 68, yFirma - 18, {
  width: 68,
});

doc.x = margen;
doc.y = yFirma + 82;

  dibujarPiePagina();

  doc.end();

  return pdfFinalizado;
}

function generarHtmlSolicitudCertificadoGastos(datos: {
  nombre: string;
  identificacion: string;
  contratosTexto: string;
  productosTexto: string;
  destinoGastos: string;
  entidadFinanciera: string;
  cedulaFallecido: string;
  nombreFallecido: string;
  fechaFallecimiento: string;
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
                      <strong style="color:#002869;">Certificado de gastos servicios funerarios</strong>.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
                      <tr>
                        <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                          <strong style="color:#002869;">Nombre:</strong> ${datos.nombre}<br />
                          <strong style="color:#002869;">Identificación:</strong> ${datos.identificacion}<br />
                          <strong style="color:#002869;">Contrato(s):</strong> ${datos.contratosTexto}<br />
                          <strong style="color:#002869;">Producto(s):</strong> ${datos.productosTexto}<br />
                          <strong style="color:#002869;">Dirigido a:</strong> ${datos.destinoGastos}<br />
                          ${
                            datos.entidadFinanciera
                              ? `<strong style="color:#002869;">Entidad:</strong> ${datos.entidadFinanciera}<br />`
                              : ""
                          }
                          <strong style="color:#002869;">Identificación del fallecido:</strong> ${datos.cedulaFallecido}<br />
                          <strong style="color:#002869;">Nombre del fallecido:</strong> ${datos.nombreFallecido}<br />
                          <strong style="color:#002869;">Fecha de fallecimiento:</strong> ${datos.fechaFallecimiento || "Pendiente por validar"}
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Tu certificado estará listo en un plazo máximo de
                      <strong>tres (3) días hábiles</strong> y podrás reclamarlo de manera presencial
                      en la oficina que seleccionaste. Si tienes alguna duda o inquietud, comunícate
                      con nuestra línea de atención al cliente al <strong>456 7000</strong>.
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

function generarPlantillaCorreoCliente(datos: {
  titulo: string;
  nombre: string;
  contenidoHtml: string;
}) {
  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  // Si ya tienes otra imagen corporativa usada en otros certificados,
  // aquí solo cambias esta ruta.
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
                      alt="Cotrafa Social"
                      style="display:block; width:100%; max-width:680px; height:auto; border:0;"
                    />
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 38px 30px; text-align:center;">
                    <h1 style="margin:0; color:#002869; font-size:26px; line-height:1.3; font-weight:800;">
                      ${escaparHtml(datos.titulo)}
                    </h1>

                    <p style="margin:22px 0 0; color:#4b5563; font-size:16px; line-height:1.7;">
                      Hola, <strong style="color:#002869;">${escaparHtml(datos.nombre)}</strong>.
                    </p>

                    ${datos.contenidoHtml}

                    <p style="margin:28px 0 0; color:#002869; font-size:15px; line-height:1.6; font-weight:700;">
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

async function enviarCorreoConfirmacion(datos: {
    destinatario: string;
    nombre: string;
    identificacion: string;
    contratosTexto: string;
    productosTexto: string;
    codigoSolicitud: string;
    destinoGastos: string;
    entidadFinanciera: string;
    cedulaFallecido: string;
    nombreFallecido: string;
    fechaFallecimiento: string;
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
      subject: "Solicitud de Certificado de gastos servicios funerarios registrada",
      html: generarHtmlSolicitudCertificadoGastos({
        nombre: datos.nombre,
        identificacion: datos.identificacion,
        contratosTexto: datos.contratosTexto,
        productosTexto: datos.productosTexto,
        destinoGastos: datos.destinoGastos,
        entidadFinanciera: datos.entidadFinanciera,
        cedulaFallecido: datos.cedulaFallecido,
        nombreFallecido: datos.nombreFallecido,
        fechaFallecimiento: datos.fechaFallecimiento,
      }),
    });
  }


  async function enviarCertificadoGastosAutomatico(datos: {
    destinatario: string;
    nombre: string;
    pdfBytes: Buffer;
    codigoAutenticidad: string;
    formaEntrega: "fisico" | "digital";
    correoInterno?: string;
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
  
    const htmlCorreo =
      datos.formaEntrega === "digital"
        ? generarPlantillaCorreoCliente({
            titulo: "Certificado generado exitosamente",
            nombre: datos.nombre,
            contenidoHtml: `
              <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
                Nos complace informarte que tu certificado de
                <strong style="color:#002869;">gastos servicios funerarios</strong>
                ha sido generado exitosamente.
              </p>
  
              <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
                Lo encontrarás adjunto en este correo para que puedas consultarlo,
                descargarlo o compartirlo cuando lo necesites.
              </p>
  
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
                <tr>
                  <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                    <strong style="color:#002869;">Nombre:</strong> ${escaparHtml(datos.nombre)}<br />
                    <strong style="color:#002869;">Código de autenticidad:</strong> ${escaparHtml(datos.codigoAutenticidad)}
                  </td>
                </tr>
              </table>
  
              <p style="margin:24px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
                En Cotrafa Social seguimos trabajando para ofrecerte servicios más ágiles y digitales que faciliten tus trámites.
              </p>
  
              <p style="margin:20px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
                Gracias por ser parte de nuestra comunidad.
              </p>
            `,
          })
        : `
          <p>Cordial saludo,</p>
  
          <p>
            Se generó un <strong>Certificado de gastos servicios funerarios</strong>
            solicitado para entrega física.
          </p>
  
          <p>
            <strong>Nombre del titular:</strong> ${escaparHtml(datos.nombre)}<br />
            <strong>Código de autenticidad:</strong> ${escaparHtml(datos.codigoAutenticidad)}
          </p>
  
          <p>
            Se adjunta el PDF para gestión interna, impresión y entrega al usuario.
          </p>
  
          <p>
            Atentamente,<br />
            <strong>Autosolicitudes Cotrafa Social</strong>
          </p>
        `;
  
    await transporter.sendMail({
      from: `"Cotrafa Social" <${from}>`,
      to:
        datos.formaEntrega === "digital"
          ? datos.destinatario
          : datos.correoInterno || CORREO_INTERNO_GASTOS_FISICO,
      subject: "Certificado de gastos servicios funerarios",
      html: htmlCorreo,
      attachments: [
        {
          filename: `certificado-gastos-${datos.codigoAutenticidad}.pdf`,
          content: datos.pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });
  }

  async function enviarCorreoDocumentoFisicoEnProceso(datos: {
    destinatario: string;
    nombre: string;
    lugarRetiro: string;
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
      subject: "Certificado de gastos servicios funerarios en proceso",
      html: generarPlantillaCorreoCliente({
        titulo: "Solicitud recibida exitosamente",
        nombre: datos.nombre,
        contenidoHtml: `
          <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
            Hemos recibido tu solicitud de
            <strong style="color:#002869;">Certificado de gastos servicios funerarios</strong>
            para entrega física.
          </p>
  
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
            <tr>
              <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                <strong style="color:#002869;">Nombre:</strong> ${escaparHtml(datos.nombre)}<br />
                <strong style="color:#002869;">Sede seleccionada:</strong> ${escaparHtml(datos.lugarRetiro)}
              </td>
            </tr>
          </table>
  
          <p style="margin:24px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
            Tu documento estará habilitado para retiro en un plazo máximo de
            <strong>tres (3) días hábiles</strong>.
          </p>
  
          <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.8;">
            Si tienes alguna duda o inquietud, puedes comunicarte con nuestra línea de atención.
          </p>
        `,
      }),
    });
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
  
    const filasContratos = datos.contratosMorosos
      .map(
        (contrato) => `
          <tr>
            <td style="border:1px solid #ddd;padding:8px;">${contrato.contrato}</td>
            <td style="border:1px solid #ddd;padding:8px;">${contrato.producto}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">${contrato.cantidadRegistrosCartera}</td>
          </tr>
        `
      )
      .join("");
  
    await transporter.sendMail({
      from: `"Cotrafa Social" <${from}>`,
      to: datos.destinatario,
      subject: "Información sobre tu solicitud de Certificado de gastos servicios funerarios",
      html: `
        <p>Cordial saludo,</p>
  
        <p>
          Recibimos tu solicitud de <strong>Certificado de gastos servicios funerarios</strong>.
          Sin embargo, actualmente registras obligaciones pendientes en uno o más contratos.
        </p>
  
        <p>
          <strong>Nombre:</strong> ${datos.nombre}<br />
          <strong>Identificación:</strong> ${datos.identificacion}
        </p>
  
        <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd;padding:8px;text-align:left;">Contrato</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left;">Producto</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:center;">Registros en cartera</th>
            </tr>
          </thead>
          <tbody>
            ${filasContratos}
          </tbody>
        </table>
  
        <p>
          Para continuar con la solicitud, te invitamos a comunicarte con nuestro equipo de atención
          y normalizar la información correspondiente.
        </p>
  
        <p>
          Atentamente,<br />
          <strong>Cotrafa Social</strong>
        </p>
      `,
    });
  }


export async function POST(request: Request) {
  try {
    const {
      modo,
      identificacion,
      destinoGastos,
      entidadFinanciera,
      cedulaFallecido,
      lugarRetiro,
      formaEntrega,
    } = await request.json();


    

    if (!identificacion || !String(identificacion).trim()) {
      return NextResponse.json(
        { ok: false, message: "Debe ingresar un número de documento." },
        { status: 400 }
      );
    }
      
      if (!cedulaFallecido || !String(cedulaFallecido).trim()) {
        return NextResponse.json(
          { ok: false, message: "Debe ingresar la identificación del fallecido." },
          { status: 400 }
        );
      }

      const contratos = await consultarContratos(String(identificacion).trim());

      const contratosExequiales = obtenerContratosExequiales(contratos);

      const contratosEmpresarialesActivos =
        obtenerContratosEmpresarialesActivos(contratos);

      const contratosParaSolicitud =
        contratosExequiales.length > 0
          ? contratosExequiales
          : contratosEmpresarialesActivos;

      const esSolicitudEmpresarial =
        contratosExequiales.length === 0 && contratosEmpresarialesActivos.length > 0;
      
      if (contratosParaSolicitud.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "No fue posible registrar la solicitud porque no se encontraron contratos válidos.",
          },
          { status: 422 }
        );
      }
      
      const datosTitular = obtenerDatosTitular(contratosParaSolicitud);

    if (
      !datosTitular.nombre ||
      !datosTitular.identificacion ||
      !datosTitular.tipoIdentificacion
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

    if (!datosTitular.email) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible registrar la solicitud porque no hay correo relacionado a la cédula.",
        },
        { status: 422 }
      );
    }

    let fallecidoRelacionado: FallecidoSolicitud | null = null;
    let esSolicitudMiPlanSinFallecido = false;
    
    if (!esSolicitudEmpresarial) {
      fallecidoRelacionado = await obtenerFallecidoEnContratos({
        contratosExequiales,
        identificacionTitular: String(identificacion).trim(),
        documentoFallecido: String(cedulaFallecido).trim(),
      });
    
      if (!fallecidoRelacionado) {
        const contratosMiPlanVigentes = obtenerContratosMiPlanVigentes(contratosExequiales);
    
        esSolicitudMiPlanSinFallecido = contratosMiPlanVigentes.length > 0;
    
        if (!esSolicitudMiPlanSinFallecido) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "La identificación ingresada no corresponde a un beneficiario fallecido asociado al contrato.",
            },
            { status: 422 }
          );
        }
      }
    }
    
    if (modo === "validar-fallecido") {
      return NextResponse.json(
        {
          ok: true,
          esMiPlan: esSolicitudMiPlanSinFallecido,
          message: esSolicitudMiPlanSinFallecido
            ? "No se encontró el fallecido como beneficiario, pero el titular cuenta con Mi Plan. La solicitud puede continuar para validación."
            : "Fallecido validado correctamente.",
          fallecido: fallecidoRelacionado,
        },
        { status: 200 }
      );
    }

    const formaEntregaTexto = String(formaEntrega || "")
  .trim()
  .toLowerCase();

console.log("FORMA ENTREGA GASTOS:", formaEntregaTexto);

if (!["fisico", "digital"].includes(formaEntregaTexto)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Debe seleccionar si desea el documento físico o digital.",
      },
      { status: 400 }
    );
  }
  
  if (!destinoGastos || !String(destinoGastos).trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Debe seleccionar a quién va dirigido el certificado.",
      },
      { status: 400 }
    );
  }
  
  if (
    String(destinoGastos).trim() === "entidad-financiera" &&
    (!entidadFinanciera || !String(entidadFinanciera).trim())
  ) {
    return NextResponse.json(
      { ok: false, message: "Debe ingresar alguna entidad." },
      { status: 400 }
    );
  }
  
  const lugarRetiroTexto = String(lugarRetiro || "").trim();

  if (
    formaEntregaTexto === "fisico" &&
    !["Bello", "Rionegro"].includes(lugarRetiroTexto)
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Debe seleccionar el lugar donde desea retirar el certificado.",
      },
      { status: 400 }
    );
  }

    if (!esSolicitudEmpresarial) {
      const contratosMorosos = await obtenerContratosMorosos(contratosExequiales);
    
      if (contratosMorosos.length > 0) {
        await enviarCorreoContratosMorosos({
          destinatario: datosTitular.email,
          nombre: datosTitular.nombre,
          identificacion: datosTitular.identificacion,
          contratosMorosos,
        });
    
        return NextResponse.json(
          {
            ok: true,
            estado: "moroso",
            message:
              "Tu solicitud fue recibida.\n\nHemos enviado información detallada al correo electrónico registrado.",
          },
          { status: 200 }
        );
      }
    }



    const nombreFallecidoSolicitud =
    fallecidoRelacionado?.nombreCompleto || "Pendiente por validar";
  
  const fechaFallecimientoSolicitud =
    fallecidoRelacionado?.fechaFallecimiento || "";
  
  const planesExequiales = esSolicitudEmpresarial
    ? contratosParaSolicitud.map((contrato) => ({
        contrato: obtenerTexto(contrato.contrato) || "No disponible",
        producto:
          obtenerTexto(contrato.nombre_producto) ||
          obtenerTexto(contrato.descripcion_producto) ||
          obtenerTexto(contrato.producto) ||
          obtenerTexto(contrato.descripcion_grupal) ||
          "Plan empresarial",
      }))
    : await obtenerPlanesExequiales(contratosExequiales);
  
  const contratosTexto = planesExequiales
    .map((plan) => plan.contrato)
    .join(" / ");
  
  const productosTexto = planesExequiales
    .map((plan) => plan.producto)
    .join(" / ");
  
  const entidadFinancieraTexto = String(entidadFinanciera || "").trim();
  
  const destinoGastosTexto =
    String(destinoGastos).trim() === "interesado"
      ? "A quien pueda interesar"
      : entidadFinancieraTexto || "Entidad no especificada";
  

  let ordenServicioEncontrada = false;


  try {
    const ordenServicio = await buscarOrdenServicioPorCedulaFallecido(
      String(cedulaFallecido).trim()
    );
  
    if (ordenServicio) {
      ordenServicioEncontrada = true;
      const datosOrdenServicio = await consultarOrdenServicioKaring(ordenServicio);
      const fallecidoOrden = extraerPrimerFallecidoOrden(datosOrdenServicio);
  
      if (fallecidoOrden) {
        const documentoFallecidoOrden = normalizarDocumento(
          String(fallecidoOrden.id_fallecido || "")
        );
  
        const documentoFallecidoSolicitud = normalizarDocumento(
          String(cedulaFallecido).trim()
        );
  
        if (documentoFallecidoOrden === documentoFallecidoSolicitud) {
          const codigoAutenticidad = generarCodigoAutenticidadGastos();
  
          const nombreFallecidoOrden = [
            obtenerTexto(fallecidoOrden.nombres_fallecido),
            obtenerTexto(fallecidoOrden.primer_apellido_fallecido),
            obtenerTexto(fallecidoOrden.segundo_apellido_fallecido),
          ]
            .filter(Boolean)
            .join(" ");
  
          const fechaFallecimientoOrden = formatearFechaLarga(
            obtenerTexto(fallecidoOrden.fecha_fallecimiento)
          );
  
          const fechaServicioOrden = formatearFechaLarga(
            obtenerTexto(fallecidoOrden.fecha_solicitud) ||
              obtenerTexto(fallecidoOrden.fecha)
          );
  
          const serviciosOrden = extraerServiciosOrden(datosOrdenServicio);
  
          const contratoAutomatico =
            planesExequiales[0]?.contrato ||
            obtenerTexto(contratosParaSolicitud[0]?.contrato) ||
            "No disponible";
  
          const pdfBytes = await generarPdfCertificadoGastosAutomatico({
            dirigidoA: destinoGastosTexto,
            codigoAutenticidad,
            ordenServicio,
            nombreTitular: datosTitular.nombre,
            identificacionTitular:
              datosTitular.identificacion || String(identificacion).trim(),
            contrato: contratoAutomatico,
            nombreFallecido: nombreFallecidoOrden || String(cedulaFallecido).trim(),
            identificacionFallecido: String(cedulaFallecido).trim(),
            fechaFallecimiento: fechaFallecimientoOrden,
            fechaServicio: fechaServicioOrden,
            servicios: serviciosOrden,
          });
  
          const datosDocAutomatico = JSON.stringify([
            {
              solicitud: "Certificado de gastos servicios funerarios",
              tipoSolicitud: "automatico",
              nombre: datosTitular.nombre,
              formaEntrega: formaEntregaTexto,
              identificacion: datosTitular.identificacion,
              contrato: contratoAutomatico,
              destinoGastos: destinoGastosTexto,
              entidadFinanciera: entidadFinancieraTexto,
              lugarRetiro: lugarRetiroTexto,
              cedulaFallecido: String(cedulaFallecido).trim(),
              nombreFallecido: nombreFallecidoOrden,
              fechaFallecimiento: fechaFallecimientoOrden,
              ordenServicio,
              codigoAutenticidad,
              correoRelacionado: datosTitular.email,
            },
          ]);
  
          await registrarSolicitudEnSheets({
            fechaCreacion: obtenerFechaRegistroTexto(),
            usuCreacion: String(identificacion).trim(),
            codigoDoc: codigoAutenticidad,
            tipoDoc: "Certificado de gastos servicios funerarios",
            quienNecesitaDoc: "Titular",
            dirigidoADoc: destinoGastosTexto,
            datosDoc: datosDocAutomatico,
          });
  
          await registrarSolicitudNivel2CertificadoGastos({
            fechaSolicitud: obtenerFechaRegistroTexto(),
            lugarRetiro: "AUTOMÁTICO",
            cedulaTitular:
              datosTitular.identificacion || String(identificacion).trim(),
            nombreTitular: datosTitular.nombre,
            cedulaFallecido: String(cedulaFallecido).trim(),
            nombreFallecido: nombreFallecidoOrden,
            fechaFallecimiento: fechaFallecimientoOrden,
            dirigidoA: destinoGastosTexto,
            observacion: `${datosTitular.email} / ${codigoAutenticidad} / ${ordenServicio} / AUTOMÁTICO / ${formaEntregaTexto.toUpperCase()}`,
          });
  
          if (formaEntregaTexto === "digital") {
            await enviarCertificadoGastosAutomatico({
              destinatario: datosTitular.email,
              nombre: datosTitular.nombre,
              pdfBytes,
              codigoAutenticidad,
              formaEntrega: "digital",
            });
          } else {
            await enviarCertificadoGastosAutomatico({
              destinatario: datosTitular.email,
              nombre: datosTitular.nombre,
              pdfBytes,
              codigoAutenticidad,
              formaEntrega: "fisico",
              correoInterno: CORREO_INTERNO_GASTOS_FISICO,
            });
          
            await enviarCorreoDocumentoFisicoEnProceso({
              destinatario: datosTitular.email,
              nombre: datosTitular.nombre,
              lugarRetiro: lugarRetiroTexto,
            });
          }
  
          return NextResponse.json(
            {
              ok: true,
              estado: "automatico",
              formaEntrega: formaEntregaTexto,
              message:
                formaEntregaTexto === "digital"
                  ? "Tu certificado fue generado automáticamente y enviado al correo electrónico registrado."
                  : "Tu solicitud fue recibida correctamente. El documento físico estará habilitado para retiro en la sede seleccionada dentro de tres (3) días hábiles.",
              codigoSolicitud: codigoAutenticidad,
              ordenServicio,
            },
            { status: 200 }
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "No fue posible generar certificado automático de gastos:",
      error
    );
  
    if (ordenServicioEncontrada) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Se encontró una orden de servicio para el fallecido, pero no fue posible generar el certificado automático en este momento. Intenta nuevamente o comunícate con nuestro equipo de atención.",
        },
        { status: 500 }
      );
    }
  }
  
  const codigoSolicitud = generarCodigoSolicitud();

    const datosDoc = JSON.stringify([
      {
        solicitud: "Certificado de gastos servicios funerarios",
        tipoSolicitud: esSolicitudEmpresarial
          ? "empresarial"
          : esSolicitudMiPlanSinFallecido
            ? "mi-plan-validacion"
            : "normal",
        formaEntrega: formaEntregaTexto,
        nombre: datosTitular.nombre,
        tipoIdentificacion: datosTitular.tipoIdentificacion,
        identificacion: datosTitular.identificacion,
        contratos: contratosTexto,
        productos: productosTexto,
        destinoGastos: destinoGastosTexto,
        entidadFinanciera: entidadFinancieraTexto,
        lugarRetiro: lugarRetiroTexto,
        cedulaFallecido: String(cedulaFallecido).trim(),
        nombreFallecido: nombreFallecidoSolicitud,
        fechaFallecimiento: fechaFallecimientoSolicitud,
        correoRelacionado: datosTitular.email,
    },
    ]);

      await registrarSolicitudEnSheets({
        fechaCreacion: obtenerFechaRegistroTexto(),
        usuCreacion: String(identificacion).trim(),
        codigoDoc: codigoSolicitud,
        tipoDoc: "Certificado de gastos servicios funerarios",
        quienNecesitaDoc: "Titular",
        dirigidoADoc: destinoGastosTexto,
        datosDoc,
      });

      await registrarSolicitudNivel2CertificadoGastos({
        fechaSolicitud: obtenerFechaRegistroTexto(),
        lugarRetiro:
        formaEntregaTexto === "digital"
          ? "DIGITAL"
          : lugarRetiroTexto.toLocaleUpperCase("es-CO"),
        cedulaTitular:
          datosTitular.identificacion || String(identificacion).trim(),
        nombreTitular: datosTitular.nombre,
        cedulaFallecido: String(cedulaFallecido).trim(),
        nombreFallecido: nombreFallecidoSolicitud,
        fechaFallecimiento: fechaFallecimientoSolicitud,
        dirigidoA: destinoGastosTexto,
        observacion: `${datosTitular.email} / ${codigoSolicitud} / ${formaEntregaTexto.toUpperCase()}`,
      });

      await enviarCorreoConfirmacion({
        destinatario: datosTitular.email,
        nombre: datosTitular.nombre,
        identificacion: datosTitular.identificacion,
        contratosTexto,
        productosTexto,
        codigoSolicitud,
        destinoGastos: destinoGastosTexto,
        entidadFinanciera: entidadFinancieraTexto,
        cedulaFallecido: String(cedulaFallecido).trim(),
        nombreFallecido: nombreFallecidoSolicitud,
        fechaFallecimiento: fechaFallecimientoSolicitud,
      });


      return NextResponse.json(
        {
          ok: true,
          formaEntrega: formaEntregaTexto,
          message:
            formaEntregaTexto === "digital"
              ? "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
              : "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. Podrás retirarla físicamente en la sede seleccionada después de transcurridos tres (3) días hábiles.",
          codigoSolicitud,
        },
        { status: 200 }
      );
  } catch (error) {
    console.error("Error registrando solicitud de Certificado de gastos servicios funerarios:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "No fue posible registrar la solicitud de certificado de gastos servicios funerarios en este momento.",
      },
      { status: 500 }
    );
  }
}