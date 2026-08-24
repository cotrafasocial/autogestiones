"use client";

import { useState } from "react";
import Script from "next/script";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import {
  FileText,
  CheckCircle2,
  FileBadge,
  ArrowLeft,
  ShieldCheck,
  BadgeDollarSign,
  Info,
  X,
  Landmark,
  Building2,
  MapPin,
} from "lucide-react";

  declare global {
    interface Window {
      grecaptcha?: {
        getResponse: () => string;
        reset: () => void;
      };
    }
  }

export default function SolicitudesPage() {
  const [tipoDocumento, setTipoDocumento] = useState("CC");
  const [identificacion, setIdentificacion] = useState("");
  const [aceptaPolitica, setAceptaPolitica] = useState(false);
  const [captchaValidado, setCaptchaValidado] = useState(false);
  const [validandoCaptcha, setValidandoCaptcha] = useState(false);
  const [validado, setValidado] = useState(false);
  const [tipoUsuarioValidado, setTipoUsuarioValidado] = useState<
      "afiliado" | "proveedor" | "afiliado-proveedor"
    >("afiliado");
  const [productoSeleccionado, setProductoSeleccionado] = useState("afiliacion");
  const [certificadoSeleccionado, setCertificadoSeleccionado] = useState("afiliacion-nucleo");
  const [mostrarModalTipoGasto, setMostrarModalTipoGasto] = useState(false);
  const [tipoGastoSeleccionado, setTipoGastoSeleccionado] = useState("");
  const [mostrarModalDestinoCertificado, setMostrarModalDestinoCertificado] = useState(false);
  const [mostrarModalPersonaCertificado, setMostrarModalPersonaCertificado] = useState(false);
  const [mostrarModalDocumentoFallecido, setMostrarModalDocumentoFallecido] = useState(false);
  const [personaCertificado, setPersonaCertificado] = useState("");
  const [tipoDocumentoBeneficiario, setTipoDocumentoBeneficiario] = useState("CC");
  const [documentoBeneficiario, setDocumentoBeneficiario] = useState("");
  const [destinoCertificado, setDestinoCertificado] = useState("");
  const [entidadCertificado, setEntidadCertificado] = useState("");
  const [mostrarModalPagosSolicitud, setMostrarModalPagosSolicitud] = useState(false);
  const [archivoAdjuntoNombre, setArchivoAdjuntoNombre] = useState("");
  const [archivoAdjuntoDetallePago, setArchivoAdjuntoDetallePago] = useState<File | null>(null);
  const [archivoAdjuntoRedDescuentos, setArchivoAdjuntoRedDescuentos] =
  useState<File | null>(null);
  const [
    archivoAdjuntoRedDescuentosNombre,
    setArchivoAdjuntoRedDescuentosNombre,
  ] = useState("");
  const [
    redDescuentosBeneficiarioMiPlan,
    setRedDescuentosBeneficiarioMiPlan,
  ] = useState(false);
  const [
    redDescuentosDebePedirDocumentoBeneficiario,
    setRedDescuentosDebePedirDocumentoBeneficiario,
  ] = useState(false);
  const [validandoPlanRedDescuentos, setValidandoPlanRedDescuentos] =
    useState(false);
  const [fechaInicioDetallePago, setFechaInicioDetallePago] = useState("");
  const [fechaFinDetallePago, setFechaFinDetallePago] = useState("");
  const [enviandoDetallePago, setEnviandoDetallePago] = useState(false);
  const [enviandoCanalEnvio, setEnviandoCanalEnvio] = useState(false);
  const [mostrarModalTramites, setMostrarModalTramites] = useState(false);
  const [destinoGastos, setDestinoGastos] = useState("");
  const [entidadPensiones, setEntidadPensiones] = useState("");
  const [cedulaFallecido, setCedulaFallecido] = useState("");
  const [lugarRetiroGastos, setLugarRetiroGastos] = useState("");
  const [nombreFallecido, setNombreFallecido] = useState("");
  const [fechaFallecimiento, setFechaFallecimiento] = useState("");
  const [buscandoNotaria, setBuscandoNotaria] = useState(false);

  const [resultadoNotaria, setResultadoNotaria] = useState<null | {
    encontrado: boolean;
    nombreFallecido?: string;
    cedulaFallecido?: string;
    fechaFallecimiento?: string;
    municipio?: string;
    notaria?: string;
    folio?: string;
    message?: string;
  }>(null);
  
  const TAMANO_MAXIMO_ADJUNTO_MB = 15;
  const LIMITE_CARACTERES_DIRIGIDO_A = 50;

  const limitarDirigidoA = (valor: string) => {
    return valor
      .slice(0, LIMITE_CARACTERES_DIRIGIDO_A)
      .toLocaleUpperCase("es-CO");
  };

  const TAMANO_MAXIMO_ADJUNTO_BYTES = TAMANO_MAXIMO_ADJUNTO_MB * 1024 * 1024;

  const TIPOS_ARCHIVO_PERMITIDOS = [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ];

  const EXTENSIONES_ARCHIVO_PERMITIDAS = [".pdf", ".jpg", ".jpeg", ".png"];
  const MENSAJE_INFORMATIVO_MODULO_DOS =
  "Este certificado requiere validación por parte de nuestro equipo. Una vez generado, será enviado al correo electrónico registrado al momento de su vinculación o al último correo electrónico actualizado en nuestros sistemas. El tiempo de respuesta para la atención de la solicitud es de hasta tres (3) días hábiles.";

  const MENSAJE_SOLICITUD_EMPRESARIAL =
  "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles.";

  const ENTIDADES_RED_DESCUENTOS = [
    "ELITE MAX",
    "AUTOESTIMA",
    "Clínica veterinaria CISVET",
    "GAS Y HOGAR",
    "Servicios Odontológicos Laura Ortega Guinger",
    "SMART ACADEMIA DE IDIOMAS",
    "Gatitud",
    "Clínica Odontológica Vid",
    "Punto Vet Clínica Veterinaria",
    "Servicios Veterinarios Santa Isabel",
    "The Dog´s Club",
    "Dentotal",
    "Barking School Dog Centro de Educación Canino",
    "CLÍNICA ESPECIALIZADA EMMSA",
    "Laboratorio Clínico Vid",
    "OPTICADIZ",
    "SMART FIT",
    "CLUENZA",
    "Universidad de San Buenaventura",
    "VIRTUAL MUEBLES",
    "Corporación cultural Te Creo",
    "Institución Universitaria Marco Fidel Suárez",
    "Opticales Santa Isabell",
    "MADECENTRO",
    "Clínica Optíca Santa Lucía",
    "Clínica Oftalmológica Sandiego",
    "DARTE ALEGRIA",
  ].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

 

  const validarRangoMaximoDosAnios = (fechaInicio: string, fechaFin: string) => {
    const inicio = new Date(`${fechaInicio}T00:00:00`);
    const fin = new Date(`${fechaFin}T00:00:00`);
  
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
      return false;
    }
  
    const fechaMaximaPermitida = new Date(inicio);
    fechaMaximaPermitida.setFullYear(fechaMaximaPermitida.getFullYear() + 2);
  
    return fin <= fechaMaximaPermitida;
  };

  const limpiarArchivoAdjunto = (inputId?: string) => {
    setArchivoAdjuntoDetallePago(null);
    setArchivoAdjuntoNombre("");
  
    if (inputId) {
      const inputArchivo = document.getElementById(inputId) as HTMLInputElement | null;
  
      if (inputArchivo) {
        inputArchivo.value = "";
      }
    }
  };

  const limpiarArchivoAdjuntoRedDescuentos = (inputId?: string) => {
    setArchivoAdjuntoRedDescuentos(null);
    setArchivoAdjuntoRedDescuentosNombre("");
  
    if (inputId) {
      const inputArchivo = document.getElementById(
        inputId
      ) as HTMLInputElement | null;
  
      if (inputArchivo) {
        inputArchivo.value = "";
      }
    }
  };

  const validarArchivoDetallePago = (archivo: File) => {
    const nombreArchivo = archivo.name.toLowerCase();

    const extensionValida = EXTENSIONES_ARCHIVO_PERMITIDAS.some((extension) =>
      nombreArchivo.endsWith(extension)
    );

    const tipoValido = TIPOS_ARCHIVO_PERMITIDOS.includes(archivo.type);

    if (!extensionValida || !tipoValido) {
      return {
        valido: false,
        mensaje: "Solo se permiten archivos PDF, JPG o PNG.",
      };
    }

    if (archivo.size > TAMANO_MAXIMO_ADJUNTO_BYTES) {
      return {
        valido: false,
        mensaje: `El archivo no puede superar los ${TAMANO_MAXIMO_ADJUNTO_MB} MB.`,
      };
    }

    return {
      valido: true,
      mensaje: "",
    };
  };

  const validarIdentificacion = async () => {
    if (!tipoDocumento) {
      alert("Por favor selecciona el tipo de documento");
      return;
    }

    if (!identificacion.trim()) {
      alert("Por favor ingresa tu número de documento");
      return;
    }

    if (!aceptaPolitica) {
      alert("Debes autorizar el tratamiento de datos personales");
      return;
    }

    const tokenCaptcha = window.grecaptcha?.getResponse();

    if (!tokenCaptcha) {
      alert("Por favor completa la validación de seguridad");
      return;
    }

    setValidandoCaptcha(true);

    try {
      const respuesta = await fetch("/api/validar-captcha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: tokenCaptcha,
        }),
      });

      const data = await respuesta.json();

      if (!respuesta.ok || !data.success) {
        alert("No fue posible validar el captcha. Intenta nuevamente.");
        window.grecaptcha?.reset();
        setCaptchaValidado(false);
        return;
      }

      setCaptchaValidado(true);

      const respuestaAfiliado = await fetch("/api/validar-afiliado", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identificacion: identificacion.trim(),
        }),
      });

      const dataAfiliado = await respuestaAfiliado.json();

      if (!respuestaAfiliado.ok || !dataAfiliado.ok) {
        alert(
          dataAfiliado.message ||
            "No fue posible validar la información del afiliado."
        );

        window.grecaptcha?.reset();
        setCaptchaValidado(false);
        return;
      }

      const tipoUsuario =
      dataAfiliado.tipoUsuario === "proveedor"
        ? "proveedor"
        : dataAfiliado.tipoUsuario === "afiliado-proveedor"
          ? "afiliado-proveedor"
          : "afiliado";
    
      setTipoUsuarioValidado(tipoUsuario);
      
      if (tipoUsuario === "proveedor") {
        setProductoSeleccionado("contrato");
        setCertificadoSeleccionado("retencion-fuente");
      } else {
        setProductoSeleccionado("afiliacion");
        setCertificadoSeleccionado("afiliacion-nucleo");
      }

      setValidado(true);

    } catch (error) {
      alert("Ocurrió un error validando el captcha");
      window.grecaptcha?.reset();
      setCaptchaValidado(false);
    } finally {
      setValidandoCaptcha(false);
    }
  };

  const productosCertificados = [
    {
      id: "afiliacion",
      titulo: "Solicita tu Certificado",
      descripcion: "Consulta y descarga tus documentos de forma inmediata",
      icon: ShieldCheck,
    },
    {
      id: "contrato",
      titulo: "Pagos y Certificados Tributarios ",
      descripcion: "Gestiona Certificados de Retefuente y consulta información de pagos",
      icon: BadgeDollarSign,
    },
    {
      id: "retencion",
      titulo: "Gestiona tus Trámites",
      descripcion: "Realiza y consulta solicitudes complementarias",
      icon: FileBadge,
    },
  ];
  
  const opcionesPorProducto: Record<string, { id: string; label: string }[]> = {
    afiliacion: [
      { id: "afiliacion-nucleo", label: "Afiliación con núcleo familiar" },
      { id: "afiliacion-fallecido", label: "Certificado de afiliación del fallecido" },
      { id: "red-descuentos", label: "Red de descuentos" },
    ],
    contrato: [
      { id: "detalle-pago", label: "Detalle de Pagos" },
      { id: "paz-salvo", label: "Paz y Salvo" },
      { id: "copia-contrato", label: "Copia de Contrato" },
      { id: "declaracion-renta", label: "Declaración de renta" },
      { id: "retencion-fuente", label: "Retención en la fuente" },
    ],
    retencion: [
      { id: "certificado-gastos", label: "Certificado de gastos servicios funerarios" },
      { id: "notaria-folio", label: "Notaría y número de folio del registro de defunción" },
    ],
  };

  const productosDisponibles =
  tipoUsuarioValidado === "proveedor"
      ? productosCertificados.filter((producto) => producto.id === "contrato")
      : productosCertificados;

      const opcionesDisponiblesPorProducto: Record<
        string,
        { id: string; label: string }[]
      > =
        tipoUsuarioValidado === "proveedor"
          ? {
              contrato: opcionesPorProducto.contrato.filter(
                (opcion) => opcion.id === "retencion-fuente"
              ),
            }
          : {
              ...opcionesPorProducto,
              contrato: opcionesPorProducto.contrato,
            };

  const obtenerNombreCertificado = () => {
    const opciones = opcionesPorProducto[productoSeleccionado] || [];
    const certificado = opciones.find(
      (opcion) => opcion.id === certificadoSeleccionado
    );
  
    return certificado?.label || "Certificado";
  };
  

  const enviarCertificadoAfiliacionFallecidoCorreo = async () => {
    if (!documentoBeneficiario.trim()) {
      alert("Por favor ingresa el número de documento del fallecido.");
      return;
    }
  
    setEnviandoCanalEnvio(true);
  
    try {
      const dirigidoA =
        destinoCertificado === "interesado"
          ? "A QUIEN PUEDA INTERESAR"
          : entidadCertificado.trim();
        
      const respuesta = await fetch("/api/certificados/afiliacion-fallecido", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identificacion: identificacion.trim(),
          documentoFallecido: documentoBeneficiario.trim(),
          dirigidoA,
          canal: "correo",
        }),
      });
  
      const data = await respuesta.json();

      if (data.estado === "empresarial") {
        alert(data.message || MENSAJE_SOLICITUD_EMPRESARIAL);

        setMostrarModalDocumentoFallecido(false);
        setDocumentoBeneficiario("");
        setDestinoCertificado("");
        setEntidadCertificado("");
        return;
      }

      if (!respuesta.ok) {
        alert(data.message || "No fue posible generar el certificado.");
        return;
      }

      alert(
        data.message ||
          "Tu certificado está listo y ya fue enviado al correo electrónico registrado."
      );
  
      setMostrarModalDocumentoFallecido(false);
      setDocumentoBeneficiario("");
      setDestinoCertificado("");
      setEntidadCertificado("");
    } catch (error) {
      alert("No fue posible generar el certificado en este momento.");
    } finally {
      setEnviandoCanalEnvio(false);
    }
  };


  const enviarCertificadoAfiliacionNucleoCorreo = async () => {
    const dirigidoA =
      destinoCertificado === "interesado"
        ? "A QUIEN PUEDA INTERESAR"
        : entidadCertificado.trim();
  
    const respuesta = await fetch("/api/certificados/afiliacion-nucleo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identificacion: identificacion.trim(),
        dirigidoA,
        canal: "correo",
        personaCertificado,
        tipoDocumentoBeneficiario,
        documentoBeneficiario: documentoBeneficiario.trim(),
      }),
    });
  
    const data = await respuesta.json();

    if (data.estado === "empresarial") {
      alert(data.message || MENSAJE_SOLICITUD_EMPRESARIAL);
      return;
    }

    if (!respuesta.ok) {
      alert(
        data.message ||
          "No fue posible enviar el certificado de afiliación con núcleo familiar por correo."
      );
      return;
    }

    alert(data.message || "El certificado fue enviado al correo registrado.");
  };

  const validarMiPlanBeneficiarioRedDescuentos = async () => {
    setValidandoPlanRedDescuentos(true);
  
    try {
      const respuesta = await fetch("/api/certificados/red-descuentos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "validar-mi-plan-beneficiario",
          identificacion: identificacion.trim(),
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok || !data.ok) {
        alert(
          data.message ||
            "No fue posible validar el tipo de plan para Red de descuentos."
        );
        return null;
      }
  
      return Boolean(data.esMiPlan);
    } catch (error) {
      alert("No fue posible validar el tipo de plan en este momento.");
      return null;
    } finally {
      setValidandoPlanRedDescuentos(false);
    }
  };

  const registrarSolicitudRedDescuentosMiPlanBeneficiario = async () => {
    if (!entidadCertificado.trim()) {
      alert("Por favor selecciona la entidad de la red de descuentos.");
      return;
    }
  
    if (!tipoDocumentoBeneficiario) {
      alert("Por favor selecciona el tipo de documento del beneficiario.");
      return;
    }
  
    if (!documentoBeneficiario.trim()) {
      alert("Por favor ingresa el número de documento del beneficiario.");
      return;
    }
  
    if (!archivoAdjuntoRedDescuentos) {
      alert("Para esta solicitud debes adjuntar un documento de soporte.");
      return;
    }
  
    const validacion = validarArchivoDetallePago(archivoAdjuntoRedDescuentos);
  
    if (!validacion.valido) {
      alert(validacion.mensaje);
      return;
    }
  
    setEnviandoCanalEnvio(true);
  
    try {
      const formData = new FormData();
  
      formData.append("modo", "solicitud-mi-plan-beneficiario");
      formData.append("identificacion", identificacion.trim());
      formData.append("dirigidoA", entidadCertificado.trim());
      formData.append("tipoDocumentoBeneficiario", tipoDocumentoBeneficiario);
      formData.append("documentoBeneficiario", documentoBeneficiario.trim());
      formData.append("archivoAdjunto", archivoAdjuntoRedDescuentos);
  
      const respuesta = await fetch("/api/certificados/red-descuentos", {
        method: "POST",
        body: formData,
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(
          data.message ||
            "No fue posible registrar la solicitud de Red de descuentos."
        );
        return;
      }
  
      alert(
        data.message ||
          "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
      );
  
      setMostrarModalDestinoCertificado(false);
      setPersonaCertificado("");
      setTipoDocumentoBeneficiario("CC");
      setDocumentoBeneficiario("");
      setDestinoCertificado("");
      setEntidadCertificado("");
      setRedDescuentosBeneficiarioMiPlan(false);
      setRedDescuentosDebePedirDocumentoBeneficiario(false);
      limpiarArchivoAdjuntoRedDescuentos("archivoRedDescuentosMiPlan");
    } catch (error) {
      alert("No fue posible registrar la solicitud en este momento.");
    } finally {
      setEnviandoCanalEnvio(false);
    }
  };

  const enviarCertificadoRedDescuentosCorreo = async () => {
    const dirigidoA = entidadCertificado.trim();
  
    const respuesta = await fetch("/api/certificados/red-descuentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identificacion: identificacion.trim(),
        dirigidoA,
        canal: "correo",
        personaCertificado,
        tipoDocumentoBeneficiario,
        documentoBeneficiario: documentoBeneficiario.trim(),
      }),
    });
  
    const data = await respuesta.json();

    if (data.estado === "empresarial") {
      alert(data.message || MENSAJE_SOLICITUD_EMPRESARIAL);
      return;
    }

    if (!respuesta.ok) {
      alert(data.message || "No fue posible enviar el certificado por correo.");
      return;
    }

    alert(data.message || "El certificado fue enviado al correo registrado.");
  };



  const registrarSolicitudDetallePago = async () => {
    if (!fechaInicioDetallePago) {
      alert("Por favor selecciona la fecha inicial.");
      return;
    }
  
    if (!fechaFinDetallePago) {
      alert("Por favor selecciona la fecha final.");
      return;
    }
  
    if (fechaInicioDetallePago > fechaFinDetallePago) {
      alert("La fecha inicial no puede ser mayor que la fecha final.");
      return;
    }

    if (
      !validarRangoMaximoDosAnios(
        fechaInicioDetallePago,
        fechaFinDetallePago
      )
    ) {
      alert("El rango máximo permitido para consultar detalle de pagos es de dos (2) años.");
      return;
    }

    if (archivoAdjuntoDetallePago) {
      const validacion = validarArchivoDetallePago(archivoAdjuntoDetallePago);
    
      if (!validacion.valido) {
        alert(validacion.mensaje);
        return;
      }
    }
  
    setEnviandoDetallePago(true);
  
    try {
      const formData = new FormData();

      formData.append("identificacion", identificacion.trim());
      formData.append("fechaInicio", fechaInicioDetallePago);
      formData.append("fechaFin", fechaFinDetallePago);

      if (archivoAdjuntoDetallePago) {
        formData.append("archivoAdjunto", archivoAdjuntoDetallePago);
      }

      const respuesta = await fetch("/api/solicitudes/detalle-pago", {
        method: "POST",
        body: formData,
      });

  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(data.message || "No fue posible registrar la solicitud de detalle de pago.");
        return;
      }
  
      alert(
        "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
      );
  
      setMostrarModalPagosSolicitud(false);
      setFechaInicioDetallePago("");
      setFechaFinDetallePago("");
      setArchivoAdjuntoNombre("");
      setArchivoAdjuntoDetallePago(null);
    } catch (error) {
      alert("No fue posible registrar la solicitud de detalle de pago en este momento.");
    } finally {
      setEnviandoDetallePago(false);
    }
  };

  const enviarCertificadoPazSalvoCorreo = async () => {
    const dirigidoA =
      destinoCertificado === "interesado"
        ? "A QUIEN PUEDA INTERESAR"
        : entidadCertificado.trim();
  
    const respuesta = await fetch("/api/certificados/paz-salvo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identificacion: identificacion.trim(),
        dirigidoA,
        canal: "correo",
      }),
    });
  
    const data = await respuesta.json();
  
    if (data.estado === "empresarial") {
      alert(data.message || MENSAJE_SOLICITUD_EMPRESARIAL);
      return;
    }
  
    if (!respuesta.ok) {
      alert(data.message || "No fue posible generar el certificado de Paz y Salvo.");
      return;
    }
  
    alert(data.message || "El certificado fue enviado al correo registrado.");
  };

  const registrarSolicitudRetencionFuente = async () => {
    setEnviandoDetallePago(true);
  
    try {
      const respuesta = await fetch("/api/certificados/retencion-fuente", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identificacion: identificacion.trim(),
          tipoUsuario: tipoUsuarioValidado,
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(data.message || "No fue posible registrar la solicitud de retención en la fuente.");
        return;
      }
  
      alert(
        data.message ||
          "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
      );
  
      setMostrarModalPagosSolicitud(false);
    } catch (error) {
      alert("No fue posible registrar la solicitud de retención en la fuente en este momento.");
    } finally {
      setEnviandoDetallePago(false);
    }
  };

  const registrarSolicitudCopiaContrato = async () => {
    setEnviandoDetallePago(true);
  
    try {
      const respuesta = await fetch("/api/solicitudes/copia-contrato", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identificacion: identificacion.trim(),
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(data.message || "No fue posible registrar la solicitud de copia de contrato.");
        return;
      }
  
      alert(
        data.message ||
          "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
      );
  
      setMostrarModalPagosSolicitud(false);
    } catch (error) {
      alert("No fue posible registrar la solicitud de copia de contrato en este momento.");
    } finally {
      setEnviandoDetallePago(false);
    }
  };

  const registrarSolicitudDeclaracionRenta = async () => {
    setEnviandoDetallePago(true);
  
    try {
      const respuesta = await fetch("/api/solicitudes/declaracion-renta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identificacion: identificacion.trim(),
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(
          data.message ||
            "No fue posible registrar la solicitud de Declaración de renta."
        );
        return;
      }
  
      alert(
        data.message ||
          "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
      );
  
      setMostrarModalPagosSolicitud(false);
    } catch (error) {
      alert(
        "No fue posible registrar la solicitud de Declaración de renta en este momento."
      );
    } finally {
      setEnviandoDetallePago(false);
    }
  };

  const registrarSolicitudCertificadoGastos = async () => {
    if (!cedulaFallecido.trim()) {
      alert("Por favor ingresa el número de identificación del fallecido.");
      return;
    }

    if (!lugarRetiroGastos) {
      alert("Por favor selecciona dónde deseas retirar el certificado.");
      return;
    }
  
  
    if (!entidadPensiones.trim()) {
      alert("Por favor ingresa a quién va dirigido el certificado.");
      return;
    }

    if (entidadPensiones.trim().length > LIMITE_CARACTERES_DIRIGIDO_A) {
      alert(`El campo dirigido a no puede superar los ${LIMITE_CARACTERES_DIRIGIDO_A} caracteres.`);
      return;
    }
  
    setEnviandoDetallePago(true);
  
    try {
      const respuesta = await fetch("/api/solicitudes/certificado-gastos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identificacion: identificacion.trim(),
          destinoGastos: "entidad-financiera",
          entidadFinanciera: entidadPensiones.trim(),
          cedulaFallecido: cedulaFallecido.trim(),
          lugarRetiro: lugarRetiroGastos,
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(
          data.message ||
            "No fue posible registrar la solicitud de certificado de gastos servicios funerarios."
        );
        return;
      }
  
      alert(
        data.message ||
          "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles."
      );
  
      setMostrarModalTipoGasto(false);
      setMostrarModalTramites(false);
      setDestinoGastos("");
      setEntidadPensiones("");
      setCedulaFallecido("");
      setLugarRetiroGastos("");
      setNombreFallecido("");
      setFechaFallecimiento("");
    } catch (error) {
      alert(
        "No fue posible registrar la solicitud de certificado de gastos servicios funerarios en este momento."
      );
    } finally {
      setEnviandoDetallePago(false);
    }
  };

  const validarFallecidoCertificadoGastos = async () => {
    if (!cedulaFallecido.trim()) {
      alert("Por favor ingresa el número de identificación del fallecido.");
      return;
    }
  
    setEnviandoDetallePago(true);
  
    try {
      const respuesta = await fetch("/api/solicitudes/certificado-gastos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "validar-fallecido",
          identificacion: identificacion.trim(),
          cedulaFallecido: cedulaFallecido.trim(),
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok || !data.ok) {
        alert(
          data.message ||
            "La identificación ingresada no corresponde a un fallecido asociado al contrato."
        );
        return;
      }
  
      setMostrarModalTipoGasto(false);
      setMostrarModalTramites(true);
    } catch (error) {
      alert("No fue posible validar la información del fallecido en este momento.");
    } finally {
      setEnviandoDetallePago(false);
    }
  };
  


  const requiereDestinoCertificado = () => {
    return (
      certificadoSeleccionado === "afiliacion-nucleo" ||
      certificadoSeleccionado === "red-descuentos"
    );
  };
  
  const continuarDesdePersonaCertificado = async () => {
    if (!personaCertificado) {
      alert("Por favor selecciona quién necesita el certificado");
      return;
    }
  
    if (
      certificadoSeleccionado === "red-descuentos" &&
      personaCertificado === "beneficiario" &&
      !redDescuentosDebePedirDocumentoBeneficiario
    ) {
      const esMiPlan = await validarMiPlanBeneficiarioRedDescuentos();
  
      if (esMiPlan === null) {
        return;
      }
  
      if (esMiPlan) {
        setRedDescuentosBeneficiarioMiPlan(true);
        setRedDescuentosDebePedirDocumentoBeneficiario(false);
        setDocumentoBeneficiario("");
        setArchivoAdjuntoRedDescuentos(null);
        setArchivoAdjuntoRedDescuentosNombre("");
        setMostrarModalPersonaCertificado(false);
        setMostrarModalDestinoCertificado(true);
        return;
      }
  
      setRedDescuentosBeneficiarioMiPlan(false);
      setRedDescuentosDebePedirDocumentoBeneficiario(true);
      return;
    }
  
    if (personaCertificado === "beneficiario") {
      if (!tipoDocumentoBeneficiario) {
        alert("Por favor selecciona el tipo de documento del beneficiario");
        return;
      }
  
      if (!documentoBeneficiario.trim()) {
        alert("Por favor ingresa el número de documento del beneficiario");
        return;
      }
    }
  
    setMostrarModalPersonaCertificado(false);
    setMostrarModalDestinoCertificado(true);
  };

  const continuarDesdeDestinoCertificado = async () => {
    if (
      certificadoSeleccionado === "red-descuentos" &&
      personaCertificado === "beneficiario" &&
      redDescuentosBeneficiarioMiPlan
    ) {
      await registrarSolicitudRedDescuentosMiPlanBeneficiario();
      return;
    }
    if (certificadoSeleccionado === "red-descuentos") {
      if (!entidadCertificado.trim()) {
        alert("Por favor selecciona la entidad de la red de descuentos.");
        return;
      }
    
      setDestinoCertificado("entidad");
    }
    
    if (certificadoSeleccionado === "afiliacion-nucleo") {
      if (!destinoCertificado) {
        alert("Por favor selecciona a quién va dirigido el certificado");
        return;
      }
    
      if (destinoCertificado === "entidad" && !entidadCertificado.trim()) {
        alert("Por favor especifica la entidad");
        return;
      }

      if (
        destinoCertificado === "entidad" &&
        entidadCertificado.trim().length > LIMITE_CARACTERES_DIRIGIDO_A
      ) {
        alert(`El campo dirigido a no puede superar los ${LIMITE_CARACTERES_DIRIGIDO_A} caracteres.`);
        return;
      }
    }

    if (certificadoSeleccionado === "paz-salvo") {
      if (!destinoCertificado) {
        alert("Por favor selecciona a quién va dirigido el certificado");
        return;
      }
    
      if (destinoCertificado === "entidad" && !entidadCertificado.trim()) {
        alert("Por favor especifica la entidad");
        return;
      }
    
      if (
        destinoCertificado === "entidad" &&
        entidadCertificado.trim().length > LIMITE_CARACTERES_DIRIGIDO_A
      ) {
        alert(
          `El campo dirigido a no puede superar los ${LIMITE_CARACTERES_DIRIGIDO_A} caracteres.`
        );
        return;
      }
    }
  
    if (certificadoSeleccionado === "afiliacion-fallecido") {
      if (!destinoCertificado) {
        alert("Por favor selecciona a quién va dirigido el certificado");
        return;
      }
  
      if (destinoCertificado === "entidad" && !entidadCertificado.trim()) {
        alert("Por favor especifica la entidad");
        return;
      }

      if (
        destinoCertificado === "entidad" &&
        entidadCertificado.trim().length > LIMITE_CARACTERES_DIRIGIDO_A
      ) {
        alert(`El campo dirigido a no puede superar los ${LIMITE_CARACTERES_DIRIGIDO_A} caracteres.`);
        return;
      }
  
      setMostrarModalDestinoCertificado(false);
      setMostrarModalDocumentoFallecido(true);
      return;
    }
  
    if (enviandoCanalEnvio) {
      return;
    }
  
    setEnviandoCanalEnvio(true);
  
    try {
      if (certificadoSeleccionado === "afiliacion-nucleo") {
        await enviarCertificadoAfiliacionNucleoCorreo();
        setMostrarModalDestinoCertificado(false);
        return;
      }
      
      if (certificadoSeleccionado === "paz-salvo") {
        await enviarCertificadoPazSalvoCorreo();
        setMostrarModalDestinoCertificado(false);
        setDestinoCertificado("");
        setEntidadCertificado("");
        return;
      }
      
      if (certificadoSeleccionado === "red-descuentos") {
        await enviarCertificadoRedDescuentosCorreo();
        setMostrarModalDestinoCertificado(false);
        return;
      }
    } finally {
      setEnviandoCanalEnvio(false);
    }
  };


  const requiereModalPagosSolicitud = () => {
    return (
      certificadoSeleccionado === "detalle-pago" ||
      certificadoSeleccionado === "copia-contrato" ||
      certificadoSeleccionado === "declaracion-renta" ||
      certificadoSeleccionado === "retencion-fuente"
    );
  };
  
  const continuarDesdePagosSolicitud = () => {
  
    if (certificadoSeleccionado === "detalle-pago") {
      registrarSolicitudDetallePago();
      return;
    }
  
    if (certificadoSeleccionado === "copia-contrato") {
      registrarSolicitudCopiaContrato();
      return;
    }

    if (certificadoSeleccionado === "declaracion-renta") {
      registrarSolicitudDeclaracionRenta();
      return;
    }
  
    if (certificadoSeleccionado === "retencion-fuente") {
      registrarSolicitudRetencionFuente();
      return;
    }
  
    setMostrarModalPagosSolicitud(false);
  };


  const requiereModalTramites = () => {
    return certificadoSeleccionado === "notaria-folio";
  };
  
  const continuarDesdeCertificadoGastos = () => {
    if (enviandoDetallePago) {
      return;
    }
  
    if (!entidadPensiones.trim()) {
      alert("Por favor ingresa a quién va dirigido el certificado.");
      return;
    }
  
    if (!lugarRetiroGastos) {
      alert("Por favor selecciona dónde deseas retirar el certificado.");
      return;
    }
  
    registrarSolicitudCertificadoGastos();
  };
  
  const buscarInformacionNotaria = async () => {
    if (!cedulaFallecido.trim()) {
      alert("Por favor ingresa la cédula del fallecido.");
      return;
    }
  
    setBuscandoNotaria(true);
    setResultadoNotaria(null);
  
    try {
      const respuesta = await fetch("/api/consultas/notaria-folio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cedulaFallecido: cedulaFallecido.trim(),
        }),
      });
  
      const data = await respuesta.json();
  
      if (!respuesta.ok) {
        alert(data.message || "No fue posible consultar la información de notaría y folio.");
        return;
      }
  
      setResultadoNotaria({
        encontrado: Boolean(data.encontrado),
        nombreFallecido: data.nombreFallecido,
        cedulaFallecido: data.cedulaFallecido,
        fechaFallecimiento: data.fechaFallecimiento,
        municipio: data.municipio,
        notaria: data.notaria,
        folio: data.folio,
        message: data.message,
      });
    } catch (error) {
      alert("No fue posible consultar la información de notaría y folio en este momento.");
    } finally {
      setBuscandoNotaria(false);
    }
  };



  return (
    <main className="min-h-screen bg-white px-3 py-3 sm:px-4 sm:py-4">
      <section className="mx-auto max-w-6xl rounded-2xl border border-gray-100 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-10">
      {!validado ? (
  <>
    <div className="mb-10">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#0090D1]/10">
        <FileText className="h-7 w-7 text-[#0090D1]" />
      </div>

      <h1 className="text-3xl font-extrabold text-[#002869] sm:text-4xl">
        Bienvenido a Solicitudes
      </h1>

      <p className="mt-3 max-w-2xl text-gray-600">
        Ingresa tus datos para validar tu información y continuar con el proceso.
      </p>
    </div>

    <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
      <div className="space-y-6">
        <Select
          label="Tipo de documento"
          selectedKeys={[tipoDocumento]}
          onChange={(e) => setTipoDocumento(e.target.value)}
          isRequired
        >
          <SelectItem key="CC">CC - Cédula de ciudadanía</SelectItem>
          <SelectItem key="CE">CE - Cédula de extranjería</SelectItem>
          <SelectItem key="PPT">PPT - Permiso por proteccion legal</SelectItem>
          <SelectItem key="NIT">NIT</SelectItem>
        </Select>

        <Input
          type="text"
          label="Número de documento"
          placeholder="Ej: 123456789"
          value={identificacion}
          onChange={(e) => setIdentificacion(e.target.value)}
          isRequired
        />

        <div className="rounded-2xl border border-[#0090D1]/20 bg-[#F5FAFD] px-4 py-4 text-sm text-[#002869]">
          <p className="leading-6">
            Para obtener más detalles sobre cómo tratamos tus datos personales, te
            invitamos a revisar nuestra política de Tratamiento de Datos Personales
            completo en el siguiente enlace:{" "}
            <a
              href="https://cotrafasocial.com/politica-privacidad/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#002869] underline underline-offset-2 hover:text-[#0090D1]"
            >
              Políticas de tratamiento de datos y privacidad
            </a>
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-[#0090D1]/20 pt-4 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={aceptaPolitica}
              onChange={(e) => setAceptaPolitica(e.target.checked)}
              className="mt-1 h-4 w-4 flex-none accent-[#0090D1]"
            />

            <span>
              He leído y acepto la autorización para el tratamiento de mis datos
              personales
            </span>
          </label>
        </div>

        <Script
          src="https://www.google.com/recaptcha/api.js"
          async
          defer
        />

        <div
          className="g-recaptcha"
          data-sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
        ></div>

        <Button
          className={`px-10 py-6 font-bold ${
            validandoCaptcha
              ? "bg-gray-300 text-gray-500"
              : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
          }`}
          onClick={validarIdentificacion}
          disabled={validandoCaptcha}
        >
          {validandoCaptcha ? "Validando..." : "Validar"}
        </Button>
      </div>

      <aside className="rounded-3xl bg-[#F5FAFD] p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-[#002869]">
          Aquí puedes gestionar:
        </h2>

        <ul className="mt-6 space-y-4 text-gray-700">
          <li className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
            <span>Certificados de afiliación</span>
          </li>

          <li className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
            <span>Detalles de pago</span>
          </li>

          <li className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
            <span>Certificados de retención en la fuente.</span>
          </li>
        </ul>

        <p className="mt-8 text-sm text-gray-600">
          Si aún no haces parte de Cotrafa Social, te invitamos a conocer nuestras membresías y servicios.
          Al ingresar encontrarás más opciones de solicitudes.
        </p>
      </aside>
    </div>
  </>
) : (
    <>
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-extrabold text-[#002869] sm:text-4xl">
          Solicitudes
        </h1>

        <p className="mt-2 text-gray-600">
          Usuario validado:{" "}
          <span className="font-semibold text-[#002869]">
            {tipoDocumento} {identificacion}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          window.location.href = "/solicitudes";
        }}
        className="flex items-center gap-2 text-sm font-semibold text-[#002869] underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Consultar otro afiliado
      </button>
    </div>

    <div className="rounded-3xl border border-gray-100 bg-white px-6 py-10 text-center">
      <h2 className="text-2xl font-bold text-[#002869] sm:text-3xl">
        Elige el producto para generar la solicitud
      </h2>

      <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-5">
        {productosDisponibles.map((producto) => {
          const Icon = producto.icon;
          const activo = productoSeleccionado === producto.id;

          return (
            <button
              key={producto.id}
              type="button"
              onClick={() => {
                setProductoSeleccionado(producto.id);
                setCertificadoSeleccionado(
                  (opcionesDisponiblesPorProducto[producto.id] || [])[0]?.id || ""
                );
              }}
              className={`group rounded-2xl border p-4 text-center shadow-md transition hover:-translate-y-1 hover:shadow-xl sm:rounded-3xl sm:p-6 ${
                activo
                  ? "border-[#002869] bg-[#002869] text-white"
                  : "border-gray-100 bg-white text-[#002869]"
              }`}
            >
              <div
                className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full transition ${
                  activo ? "bg-white/15" : "bg-[#0090D1]/10 group-hover:bg-[#0090D1]/20"
                }`}
              >
                <Icon
                  className={`h-9 w-9 ${
                    activo ? "text-white" : "text-[#0090D1]"
                  }`}
                />
              </div>

              <h3 className="text-xl font-extrabold">
                {producto.titulo}
              </h3>

              <p
                className={`mt-2 text-sm font-medium italic ${
                  activo ? "text-white/80" : "text-gray-500"
                }`}
              >
                {producto.descripcion}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
      {(opcionesDisponiblesPorProducto[productoSeleccionado] || []).map((opcion) => {
          const activo = certificadoSeleccionado === opcion.id;

          return (
            <button
              key={opcion.id}
              type="button"
              onClick={() => setCertificadoSeleccionado(opcion.id)}
              className={`flex items-center gap-4 rounded-xl border px-5 py-4 text-left font-semibold transition ${
                activo
                  ? "border-[#0090D1] bg-[#F5FAFD] text-[#002869]"
                  : "border-gray-200 bg-white text-gray-600 hover:border-[#0090D1]"
              }`}
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border ${
                  activo
                    ? "border-[#0090D1] bg-[#0090D1] text-white"
                    : "border-[#0090D1] bg-white text-white"
                }`}
              >
                {activo && <CheckCircle2 className="h-5 w-5" />}
              </span>

              <span>{opcion.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-8 max-w-4xl rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
          <p>
            Si no encuentras la solicitud que necesitas, comunícate con nuestra línea de
            servicio al cliente 456 7000, o al{" "}
            <a
              href="https://wa.me/573117641389?text=Hola%2C%20vengo%20de%20la%20p%C3%A1gina%20de%20certificados%20y%20necesito%20apoyo."
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#00843D] underline underline-offset-2 hover:text-[#006B32]"
            >
              WhatsApp +57 311 764 1389
            </a>{" "}
            para recibir acompañamiento. Ten en cuenta que los certificados o respuestas
            a tus solicitudes serán enviados al último correo electrónico registrado en
            nuestro sistema; si no recibes la información, solicita la verificación o
            actualización de tus datos.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
        <Button
          className="bg-[#0090D1] px-10 py-6 font-bold text-white hover:bg-[#007bb3]"
          onClick={() => {
          
            if (certificadoSeleccionado === "paz-salvo") {
              setDestinoCertificado("");
              setEntidadCertificado("");
              setMostrarModalDestinoCertificado(true);
              return;
            }

            if (certificadoSeleccionado === "afiliacion-fallecido") {
              setDocumentoBeneficiario("");
              setDestinoCertificado("");
              setEntidadCertificado("");
              setMostrarModalDestinoCertificado(true);
              return;
            }
            
            if (requiereDestinoCertificado()) {
              setPersonaCertificado("");
              setTipoDocumentoBeneficiario("CC");
              setDocumentoBeneficiario("");
              setDestinoCertificado("");
              setEntidadCertificado("");
              setRedDescuentosBeneficiarioMiPlan(false);
              setRedDescuentosDebePedirDocumentoBeneficiario(false);
              setArchivoAdjuntoRedDescuentos(null);
              setArchivoAdjuntoRedDescuentosNombre("");
              setMostrarModalPersonaCertificado(true);
              return;
            }

            if (certificadoSeleccionado === "certificado-gastos") {
              setDestinoGastos("");
              setEntidadPensiones("");
              setCedulaFallecido("");
              setLugarRetiroGastos("");
              setNombreFallecido("");
              setFechaFallecimiento("");
              setResultadoNotaria(null);
              setMostrarModalTipoGasto(true);
              return;
            }
            
            if (requiereModalTramites()) {
              setDestinoGastos("");
              setEntidadPensiones("");
              setCedulaFallecido("");
              setLugarRetiroGastos("");
              setNombreFallecido("");
              setFechaFallecimiento("");
              setResultadoNotaria(null);
              setMostrarModalTramites(true);
              return;
            }
            
            if (requiereModalPagosSolicitud()) {
              setArchivoAdjuntoNombre("");
              setArchivoAdjuntoDetallePago(null);
              setFechaInicioDetallePago("");
              setFechaFinDetallePago("");
              setMostrarModalPagosSolicitud(true);
              return;
            }
            

          }}
        >
          Continuar
        </Button>
      </div>
    </div>
  </>
)}
      </section>
      {mostrarModalTramites && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#002869]">
                  <Info className="h-6 w-6 text-[#002869]" />
                </div>

          <h3 className="text-xl font-bold text-gray-900">
            Información del trámite
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setMostrarModalTramites(false)}
          className="rounded-full p-2 text-[#002869] transition hover:bg-gray-100"
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 text-center sm:px-6 sm:py-10">
      {certificadoSeleccionado === "certificado-gastos" && (
          <>
            <p className="text-xl font-semibold text-gray-500">
              ¿A quién va dirigido el certificado?
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Escribe el nombre de la entidad, persona o destinatario que debe aparecer en el certificado.
            </p>

            <div className="mt-8 grid gap-5 text-left">
              <Input
                type="text"
                label="Dirigido a"
                placeholder="Ej: Banco, aseguradora, entidad solicitante"
                value={entidadPensiones}
                maxLength={LIMITE_CARACTERES_DIRIGIDO_A}
                description={`${entidadPensiones.length}/${LIMITE_CARACTERES_DIRIGIDO_A} caracteres`}
                onChange={(e) => {
                  setDestinoGastos("entidad-financiera");
                  setEntidadPensiones(limitarDirigidoA(e.target.value));
                }}
                isRequired
              />

              <div>
              <div className="mb-3 flex items-center gap-2 text-[#002869]">
                <MapPin className="h-5 w-5" />
                <h4 className="text-base font-bold">
                  Lugar de retiro
                </h4>
              </div>

                <p className="mb-4 text-sm text-gray-500">
                  Selecciona la sede donde deseas realizar el retiro físico del documento.
                </p>

                <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
                  <button
                    type="button"
                    onClick={() => setLugarRetiroGastos("Bello")}
                    className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                      lugarRetiroGastos === "Bello"
                        ? "border-[#002869] bg-[#F5FAFD]"
                        : "border-gray-200 bg-white hover:border-[#0090D1]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border ${
                        lugarRetiroGastos === "Bello"
                          ? "border-[#002869] bg-[#002869]"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {lugarRetiroGastos === "Bello" && (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>

                    <Building2 className="h-7 w-7 flex-none text-[#002869]" />

                      <span>
                        <span className="block font-bold text-[#002869]">Bello</span>
                        <span className="block text-sm text-gray-500">
                          Sede Bello - Antioquia
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLugarRetiroGastos("Rionegro")}
                    className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                      lugarRetiroGastos === "Rionegro"
                        ? "border-[#002869] bg-[#F5FAFD]"
                        : "border-gray-200 bg-white hover:border-[#0090D1]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border ${
                        lugarRetiroGastos === "Rionegro"
                          ? "border-[#002869] bg-[#002869]"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {lugarRetiroGastos === "Rionegro" && (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>

                    <Landmark className="h-7 w-7 flex-none text-[#002869]" />

                      <span>
                      <span className="block font-bold text-[#002869]">Rionegro</span>
                      <span className="block text-sm text-gray-500">
                        Sede Rionegro - Antioquia
                      </span>
                    </span>
                  </button>

                  <div className="rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-4 py-3 text-sm text-[#002869]">
                    El certificado estará disponible para retiro después de tres (3) días hábiles.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

{certificadoSeleccionado === "notaria-folio" && (
  <>
    <p className="text-xl font-semibold text-gray-500">
      Consulta de notaría y folio
    </p>

    <p className="mt-3 text-sm text-gray-500">
      Ingresa el número de identificación del fallecido para consultar información asociada.
    </p>

    <div className="mt-8 grid gap-5 text-left">
      <Input
        type="text"
        label="Número de identificación del fallecido"
        placeholder="Ej: 123456789"
        value={cedulaFallecido}
        onChange={(e) => {
          setCedulaFallecido(e.target.value);
          setResultadoNotaria(null);
        }}
        isRequired
      />
    </div>

    <div className="mt-8">
      <Button
        className={`px-10 py-6 font-bold ${
          buscandoNotaria
            ? "bg-gray-300 text-gray-500"
            : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
        }`}
        onClick={buscarInformacionNotaria}
        disabled={buscandoNotaria}
      >
        {buscandoNotaria ? "Buscando..." : "Buscar"}
      </Button>
    </div>

    {resultadoNotaria?.encontrado && (
      <div className="mt-8 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-left text-sm text-green-800">
        <p className="font-bold">Información encontrada</p>

        <p className="mt-2">
          <span className="font-semibold">Nombre del fallecido:</span>{" "}
          {resultadoNotaria.nombreFallecido || "No disponible"}
        </p>

        <p className="mt-1">
          <span className="font-semibold">Cédula del fallecido:</span>{" "}
          {resultadoNotaria.cedulaFallecido || cedulaFallecido}
        </p>

        <p className="mt-1">
          <span className="font-semibold">Fecha de fallecimiento:</span>{" "}
          {resultadoNotaria.fechaFallecimiento || "No disponible"}
        </p>

        <p className="mt-1">
          <span className="font-semibold">Notaría:</span>{" "}
          {resultadoNotaria.notaria || "No disponible"}
        </p>

        <p className="mt-1">
          <span className="font-semibold">Municipio:</span>{" "}
          {resultadoNotaria.municipio || "No disponible"}
        </p>

        <p className="mt-1">
          <span className="font-semibold">
            Número de Folio del Registro de Defunción:
          </span>{" "}
          {resultadoNotaria.folio || "No disponible"}
        </p>
      </div>
    )}

    {resultadoNotaria && !resultadoNotaria.encontrado && (
      <div className="mt-8 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-left text-sm text-red-700">
        {resultadoNotaria.message ||
          "En este momento no encontramos información asociada a la consulta realizada. Para recibir acompañamiento, comunícate con nuestra linea de servicio al cliente 456 7000 ext 5."}
      </div>
    )}
  </>
)}
      </div>

      <div className="shrink-0 flex flex-col justify-center gap-3 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:px-6 sm:py-5">
        <Button
          className="w-full border border-[#002869] bg-white px-8 py-5 font-bold text-[#002869] sm:w-auto sm:px-12 sm:py-6"
          onClick={() => setMostrarModalTramites(false)}
        >
          Regresar
        </Button>

        {certificadoSeleccionado === "certificado-gastos" && (
            <Button
              className={`w-full px-8 py-5 font-bold sm:w-auto sm:px-12 sm:py-6 ${
                enviandoDetallePago
                  ? "bg-gray-300 text-gray-500"
                  : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
              }`}
              onClick={continuarDesdeCertificadoGastos}
              disabled={enviandoDetallePago}
            >
              {enviandoDetallePago ? "Enviando..." : "Enviar solicitud"}
            </Button>
          )}

        {certificadoSeleccionado === "notaria-folio" && (
          <Button
            className="w-full bg-[#0090D1] px-8 py-5 font-bold text-white hover:bg-[#007bb3] sm:w-auto sm:px-12 sm:py-6"
            onClick={() => {
              setMostrarModalTramites(false);
              setCedulaFallecido("");
              setResultadoNotaria(null);
            }}
          >
            Cerrar
          </Button>
        )}
      </div>
    </div>
  </div>
        )}


      {mostrarModalPagosSolicitud && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#002869]">
            <Info className="h-6 w-6 text-[#002869]" />
          </div>

          <h3 className="text-xl font-bold text-gray-900">
            Información de la solicitud
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setMostrarModalPagosSolicitud(false)}
          className="rounded-full p-2 text-[#002869] transition hover:bg-gray-100"
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-10 text-center">
      {certificadoSeleccionado === "detalle-pago" && (
  <>
    <div className="rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
        
        <p>{MENSAJE_INFORMATIVO_MODULO_DOS}</p>        
      </div>
    </div>

    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 text-left">
      <h4 className="text-lg font-bold text-[#002869]">
        Período a consultar
      </h4>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Input
          type="date"
          label="Fecha inicial"
          value={fechaInicioDetallePago}
          onChange={(e) => setFechaInicioDetallePago(e.target.value)}
          isRequired
        />

        <Input
          type="date"
          label="Fecha final"
          value={fechaFinDetallePago}
          onChange={(e) => setFechaFinDetallePago(e.target.value)}
          isRequired
        />
      </div>

      <div className="mt-4 space-y-1 text-sm text-gray-500">
        <p>La fecha final debe ser mayor o igual a la fecha inicial.</p>
        <p>
          El rango máximo permitido para consultar detalle de pagos es de dos (2) años.
        </p>
      </div>
    </div>

    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left">
      <h4 className="text-lg font-bold text-[#002869]">
        Adjuntar documento de soporte (opcional)
      </h4>

      <p className="mt-2 text-sm text-gray-500">
        Si realizaste un pago recientemente y aún no se refleja en nuestros sistemas, puedes adjuntar el soporte o comprobante.
      </p>

      <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <input
          type="file"
          id="archivoPago"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => {
            const archivo = e.target.files?.[0] || null;

            if (!archivo) {
              setArchivoAdjuntoDetallePago(null);
              setArchivoAdjuntoNombre("");
              return;
            }

            const validacion = validarArchivoDetallePago(archivo);

            if (!validacion.valido) {
              alert(validacion.mensaje);
              e.target.value = "";
              setArchivoAdjuntoDetallePago(null);
              setArchivoAdjuntoNombre("");
              return;
            }

            setArchivoAdjuntoDetallePago(archivo);
            setArchivoAdjuntoNombre(archivo.name);
          }}
        />

        <label
          htmlFor="archivoPago"
          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#0090D1] px-6 py-3 font-bold text-white hover:bg-[#007bb3]"
        >
          Selecciona un archivo
        </label>

        <p className="mt-3 text-sm text-gray-500">
          Formatos permitidos: PDF, JPG, PNG. Tamaño máximo: 15 MB
        </p>

        {archivoAdjuntoNombre && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-[#0090D1]/20 bg-white px-4 py-3 text-sm font-semibold text-[#002869]">
            <span className="break-all">
              Archivo seleccionado: {archivoAdjuntoNombre}
            </span>

            <button
              type="button"
              onClick={() => limpiarArchivoAdjunto("archivoPago")}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100"
              title="Quitar archivo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  </>
)}

{certificadoSeleccionado === "copia-contrato" && (
  <>
    <div className="rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
        <p>{MENSAJE_INFORMATIVO_MODULO_DOS}</p>
      </div>
    </div>
  </>
)}

{certificadoSeleccionado === "declaracion-renta" && (
  <>
    <div className="rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
        <p>{MENSAJE_INFORMATIVO_MODULO_DOS}</p>
      </div>
    </div>
  </>
)}

{certificadoSeleccionado === "retencion-fuente" && (
  <>
    <div className="rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
        <p>
        Tu solicitud está siendo procesada. Estamos consultando la información disponible para generar tu certificado. Si encontramos información asociada, el certificado será enviado al correo electrónico registrado en nuestros sistemas. En caso contrario, no se generará el certificado.
        </p>
      </div>
    </div>
  </>
)}
        </div>

        <div className="shrink-0 flex flex-col justify-center gap-4 border-t border-gray-100 bg-white px-6 py-5 sm:flex-row">
          <Button
            className="w-full border border-[#002869] bg-white px-8 py-5 font-bold text-[#002869] sm:w-auto sm:px-12 sm:py-6"
            onClick={() => setMostrarModalPagosSolicitud(false)}
          >
            Regresar
          </Button>

          <Button
            className={`w-full px-8 py-5 font-bold sm:w-auto sm:px-12 sm:py-6 ${
              enviandoDetallePago
                ? "bg-gray-300 text-gray-500"
                : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
            }`}
            onClick={continuarDesdePagosSolicitud}
            disabled={enviandoDetallePago}
          >
            {certificadoSeleccionado === "retencion-fuente" ||
              certificadoSeleccionado === "copia-contrato" ||
              certificadoSeleccionado === "declaracion-renta"
                ? enviandoDetallePago
                  ? "Enviando..."
                  : "Solicitar certificado"
                : certificadoSeleccionado === "detalle-pago"
                  ? enviandoDetallePago
                    ? "Enviando..."
                    : "Enviar solicitud"
                  : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
        )}



{mostrarModalPersonaCertificado && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
    <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#002869]">
            <Info className="h-6 w-6 text-[#002869]" />
          </div>

          <h3 className="text-xl font-bold text-gray-900">
            Datos del certificado
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setMostrarModalPersonaCertificado(false)}
          className="rounded-full p-2 text-[#002869] transition hover:bg-gray-100"
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 text-center sm:px-6 sm:py-10">
        <p className="text-xl font-semibold text-gray-500">
          ¿Quién necesita el certificado?
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPersonaCertificado("titular")}
            className={`rounded-lg border p-4 transition hover:border-[#002869] hover:shadow-md sm:p-6 ${
              personaCertificado === "titular"
                ? "border-[#002869] bg-[#F5FAFD]"
                : "border-gray-200 bg-white"
            }`}
          >
            <FileText className="mx-auto h-9 w-9 text-[#002869]" />
            <span className="mt-3 block text-lg font-bold text-[#002869]">
              Titular
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPersonaCertificado("beneficiario")}
            className={`rounded-lg border p-6 transition hover:border-[#002869] hover:shadow-md ${
              personaCertificado === "beneficiario"
                ? "border-[#002869] bg-[#F5FAFD]"
                : "border-gray-200 bg-white"
            }`}
          >
            <FileBadge className="mx-auto h-9 w-9 text-[#002869]" />
            <span className="mt-3 block text-lg font-bold text-[#002869]">
              Beneficiario
            </span>
          </button>
        </div>

        {certificadoSeleccionado === "afiliacion-nucleo" && (
          <div className="mt-6 rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0090D1] text-white">
                <Info className="h-5 w-5" />
              </div>

              <div>
                <p className="font-bold">Información importante</p>

                <p className="mt-2 text-gray-700">
                  En las asistencias Mi familia Primaria (Mi plan), los beneficiarios
                  no se registran de forma individual; por lo tanto, el certificado no
                  incluye sus nombres.
                </p>

                <p className="mt-1 text-gray-700">
                  Tenga presente que para estas asistencias, la cobertura de los hijos aplica hasta los{" "}
                  <span className="font-bold text-[#002869]">30 años</span>.
                </p>
              </div>
            </div>
          </div>
        )}

{personaCertificado === "beneficiario" &&
  certificadoSeleccionado === "red-descuentos" &&
  !redDescuentosDebePedirDocumentoBeneficiario && (
    <div className="mt-6 rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0090D1] text-white">
          <Info className="h-5 w-5" />
        </div>

        <div>
          <p className="font-bold">Validación del tipo de plan</p>

          <p className="mt-2 text-gray-700">
            Al continuar, validaremos si tu asistencia corresponde a Mi Plan.
            Si es así, la solicitud del beneficiario requerirá adjuntar un
            soporte para ser revisada por nuestro equipo.
          </p>
        </div>
      </div>
    </div>
  )}

        {personaCertificado === "beneficiario" &&
          (certificadoSeleccionado !== "red-descuentos" ||
            redDescuentosDebePedirDocumentoBeneficiario) && (
          <div className="mt-8 grid gap-5 text-left">
            <Select
              label="Tipo de documento"
              selectedKeys={[tipoDocumentoBeneficiario]}
              onChange={(e) => setTipoDocumentoBeneficiario(e.target.value)}
              isRequired
            >
              <SelectItem key="CC">CC - Cédula de ciudadanía</SelectItem>
              <SelectItem key="TI">TI - Tarjeta de identidad</SelectItem>
              <SelectItem key="RC">RC - Registro civil</SelectItem>
              <SelectItem key="CE">CE - Cédula de extranjería</SelectItem>
            </Select>

            <Input
              type="text"
              label="Número de documento"
              placeholder="Ej: 123456789"
              value={documentoBeneficiario}
              onChange={(e) => setDocumentoBeneficiario(e.target.value)}
              isRequired
            />

          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col justify-center gap-3 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:px-6 sm:py-5">
        <Button
          className="w-full border border-[#002869] bg-white px-8 py-5 font-bold text-[#002869] sm:w-auto sm:px-12 sm:py-6"
          onClick={() => setMostrarModalPersonaCertificado(false)}
        >
          Regresar
        </Button>

        <Button
          className={`w-full px-8 py-5 font-bold sm:w-auto sm:px-12 sm:py-6 ${
            validandoPlanRedDescuentos
              ? "bg-gray-300 text-gray-500"
              : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
          }`}
          onClick={continuarDesdePersonaCertificado}
          disabled={validandoPlanRedDescuentos}
        >
          {validandoPlanRedDescuentos ? "Validando plan..." : "Siguiente"}
        </Button>
      </div>
    </div>
  </div>
)}


      {mostrarModalDestinoCertificado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#002869]">
                  <Info className="h-6 w-6 text-[#002869]" />
                </div>

                <h3 className="text-xl font-bold text-gray-900">
                  Datos del certificado
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setMostrarModalDestinoCertificado(false)}
                className="rounded-full p-2 text-[#002869] transition hover:bg-gray-100"
              >
                <X className="h-7 w-7" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 text-center sm:px-6 sm:py-10">
    {certificadoSeleccionado === "red-descuentos" ? (
      <>
        <p className="text-xl font-semibold text-gray-500">
          Selecciona la entidad de la red de descuentos
        </p>

        <p className="mt-3 text-sm text-gray-500">
          El certificado será dirigido a la entidad seleccionada.
        </p>

        <div className="mt-8 text-left">
          <Autocomplete
            label="Entidad"
            placeholder="Escribe o selecciona una entidad"
            selectedKey={entidadCertificado || null}
            onSelectionChange={(key) => {
              const entidadSeleccionada = key ? String(key) : "";

              setDestinoCertificado(entidadSeleccionada ? "entidad" : "");
              setEntidadCertificado(entidadSeleccionada);
            }}
            defaultItems={ENTIDADES_RED_DESCUENTOS.map((entidad) => ({
              key: entidad,
              label: entidad,
            }))}
            isRequired
          >
            {(item) => (
              <AutocompleteItem key={item.key}>
                {item.label}
              </AutocompleteItem>
            )}
          </Autocomplete>
        </div>

        {redDescuentosBeneficiarioMiPlan && (
  <>
    <div className="mt-6 rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
        <p>
          Esta solicitud corresponde a beneficiario de Mi Plan. Para continuar,
          debes ingresar el documento del beneficiario y adjuntar un soporte.
          La solicitud será revisada por nuestro equipo y la respuesta será
          enviada al correo registrado.
        </p>
      </div>
    </div>

    <div className="mt-6 grid gap-5 text-left">
      <Select
        label="Tipo de documento del beneficiario"
        selectedKeys={[tipoDocumentoBeneficiario]}
        onChange={(e) => setTipoDocumentoBeneficiario(e.target.value)}
        isRequired
      >
        <SelectItem key="CC">CC - Cédula de ciudadanía</SelectItem>
        <SelectItem key="TI">TI - Tarjeta de identidad</SelectItem>
        <SelectItem key="RC">RC - Registro civil</SelectItem>
        <SelectItem key="CE">CE - Cédula de extranjería</SelectItem>
      </Select>

      <Input
        type="text"
        label="Número de documento del beneficiario"
        placeholder="Ej: 123456789"
        value={documentoBeneficiario}
        onChange={(e) => setDocumentoBeneficiario(e.target.value)}
        isRequired
      />
    </div>

    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left">
      <h4 className="text-lg font-bold text-[#002869]">
        Adjuntar documento de soporte
      </h4>

      <p className="mt-2 text-sm text-gray-500">
        Para solicitudes de beneficiarios Mi Plan, el soporte es obligatorio.
      </p>

      <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <input
          type="file"
          id="archivoRedDescuentosMiPlan"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => {
            const archivo = e.target.files?.[0] || null;

            if (!archivo) {
              setArchivoAdjuntoRedDescuentos(null);
              setArchivoAdjuntoRedDescuentosNombre("");
              return;
            }

            const validacion = validarArchivoDetallePago(archivo);

            if (!validacion.valido) {
              alert(validacion.mensaje);
              e.target.value = "";
              setArchivoAdjuntoRedDescuentos(null);
              setArchivoAdjuntoRedDescuentosNombre("");
              return;
            }

            setArchivoAdjuntoRedDescuentos(archivo);
            setArchivoAdjuntoRedDescuentosNombre(archivo.name);
          }}
        />

        <label
          htmlFor="archivoRedDescuentosMiPlan"
          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#0090D1] px-6 py-3 font-bold text-white hover:bg-[#007bb3]"
        >
          Selecciona un archivo
        </label>

        <p className="mt-3 text-sm text-gray-500">
          Formatos permitidos: PDF, JPG, PNG. Tamaño máximo: 15 MB
        </p>

        {archivoAdjuntoRedDescuentosNombre && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-[#0090D1]/20 bg-white px-4 py-3 text-sm font-semibold text-[#002869]">
            <span className="break-all">
              Archivo seleccionado: {archivoAdjuntoRedDescuentosNombre}
            </span>

            <button
              type="button"
              onClick={() =>
                limpiarArchivoAdjuntoRedDescuentos(
                  "archivoRedDescuentosMiPlan"
                )
              }
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100"
              title="Quitar archivo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  </>
)}
    </>
  ) : (
    <>
      <p className="text-xl font-semibold text-gray-500">
        ¿A quién va dirigido el certificado?
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setDestinoCertificado("interesado");
            setEntidadCertificado("");
          }}
          className={`rounded-lg border p-4 transition hover:border-[#002869] hover:shadow-md sm:p-6 ${
            destinoCertificado === "interesado"
              ? "border-[#002869] bg-[#F5FAFD]"
              : "border-gray-200 bg-white"
          }`}
        >
          <FileText className="mx-auto h-9 w-9 text-[#002869]" />
          <span className="mt-3 block text-lg font-bold text-[#002869]">
            A quien pueda interesar
          </span>
        </button>

        <button
          type="button"
          onClick={() => setDestinoCertificado("entidad")}
          className={`rounded-lg border p-6 transition hover:border-[#002869] hover:shadow-md ${
            destinoCertificado === "entidad"
              ? "border-[#002869] bg-[#F5FAFD]"
              : "border-gray-200 bg-white"
          }`}
        >
          <FileBadge className="mx-auto h-9 w-9 text-[#002869]" />
          <span className="mt-3 block text-lg font-bold text-[#002869]">
            Especifique la entidad
          </span>
        </button>
      </div>

      {destinoCertificado === "entidad" && (
        <div className="mt-8 text-left">
         <Input
            type="text"
            label="Entidad"
            placeholder="Ej: Banco, aseguradora, entidad solicitante"
            value={entidadCertificado}
            maxLength={LIMITE_CARACTERES_DIRIGIDO_A}
            description={`${entidadCertificado.length}/${LIMITE_CARACTERES_DIRIGIDO_A} caracteres`}
            onChange={(e) => setEntidadCertificado(limitarDirigidoA(e.target.value))}
            isRequired
          />
        </div>
      )}
    </>
  )}
</div>

            <div className="shrink-0 flex flex-col justify-center gap-3 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:px-6 sm:py-5">
            <Button
              className={`border border-[#002869] bg-white px-12 py-6 font-bold ${
                enviandoCanalEnvio ? "text-gray-400" : "text-[#002869]"
              }`}
              onClick={() => {
                if (!enviandoCanalEnvio) {
                  setMostrarModalDestinoCertificado(false);
                }
              }}
              disabled={enviandoCanalEnvio}
            >
              Regresar
            </Button>

            <Button
              className={`w-full px-8 py-5 font-bold sm:w-auto sm:px-12 sm:py-6 ${
                enviandoCanalEnvio
                  ? "bg-gray-300 text-gray-500"
                  : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
              }`}
              onClick={continuarDesdeDestinoCertificado}
              disabled={enviandoCanalEnvio}
            >
              {enviandoCanalEnvio
                ? "Enviando..."
                : certificadoSeleccionado === "red-descuentos" &&
                    personaCertificado === "beneficiario" &&
                    redDescuentosBeneficiarioMiPlan
                  ? "Enviar solicitud"
                  : "Continuar"}
            </Button>
            </div>
          </div>
        </div>
      )}

{mostrarModalDocumentoFallecido && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
    <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#002869]">
            <Info className="h-6 w-6 text-[#002869]" />
          </div>

          <h3 className="text-xl font-bold text-gray-900">
            Datos del fallecido
          </h3>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!enviandoCanalEnvio) {
              setMostrarModalDocumentoFallecido(false);
            }
          }}
          className="rounded-full p-2 text-[#002869] transition hover:bg-gray-100"
          disabled={enviandoCanalEnvio}
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 text-center sm:px-6 sm:py-10">
  <p className="text-xl font-semibold text-gray-500">
    Ingresa el documento del fallecido
  </p>

  <div className="mt-6 rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0090D1] text-white">
        <Info className="h-5 w-5" />
      </div>

      <div>
        <p className="font-bold">Ten en cuenta:</p>

        <p className="mt-2 text-gray-700">
          En esta opción, sólo podrás consultar información de fallecimientos a partir del año{" "}
          <span className="font-bold text-[#002869]">2016</span>. En caso de requerir información de fechas anteriores, comunicate con nuestra línea de servicio al cliente para recibir acompañamiento.
        </p>
      </div>
    </div>
  </div>

  <div className="mt-8 grid gap-5 text-left">
    <Input
      type="text"
      label="Número de identificación del fallecido"
      placeholder="Ej: 123456789"
      value={documentoBeneficiario}
      onChange={(e) => setDocumentoBeneficiario(e.target.value)}
      isRequired
    />
  </div>
</div>

      <div className="shrink-0 flex flex-col justify-center gap-3 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:px-6 sm:py-5">
        <Button
          className={`border border-[#002869] bg-white px-12 py-6 font-bold ${
            enviandoCanalEnvio ? "text-gray-400" : "text-[#002869]"
          }`}
          onClick={() => {
            if (!enviandoCanalEnvio) {
              setMostrarModalDocumentoFallecido(false);
              setMostrarModalDestinoCertificado(true);
            }
          }}
          disabled={enviandoCanalEnvio}
        >
          Regresar
        </Button>

        <Button
          className={`w-full px-8 py-5 font-bold sm:w-auto sm:px-12 sm:py-6 ${
            enviandoCanalEnvio
              ? "bg-gray-300 text-gray-500"
              : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
          }`}
          onClick={enviarCertificadoAfiliacionFallecidoCorreo}
          disabled={enviandoCanalEnvio}
        >
          {enviandoCanalEnvio ? "Enviando..." : "Generar certificado"}
        </Button>
      </div>
    </div>
  </div>
)}

{mostrarModalTipoGasto && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
    <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#002869]">
            <Info className="h-6 w-6 text-[#002869]" />
          </div>

          <h3 className="text-xl font-bold text-gray-900">
            Datos del fallecido
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setMostrarModalTipoGasto(false)}
          className="rounded-full p-2 text-[#002869] transition hover:bg-gray-100"
          disabled={enviandoDetallePago}
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 text-center sm:px-6 sm:py-10">
  <div className="rounded-xl border border-[#0090D1]/20 bg-[#F5FAFD] px-5 py-4 text-left text-sm text-[#002869]">
    <div className="flex items-start gap-3">
      <Info className="mt-0.5 h-5 w-5 flex-none text-[#0090D1]" />
      <p>
        Este certificado requiere validación por parte de nuestro equipo.
        Podrás retirarlo físicamente en la sede seleccionada después de
        <strong> transcurridos tres (3) días hábiles.</strong>
      </p>
    </div>
  </div>

  <div className="mt-8 grid gap-5 text-left">
    <Input
      type="text"
      label="Número de identificación del fallecido"
      placeholder="Ej: 123456789"
      value={cedulaFallecido}
      onChange={(e) => setCedulaFallecido(e.target.value)}
      isRequired
    />
  </div>
</div>

<div className="shrink-0 flex flex-col justify-center gap-3 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:px-6 sm:py-5">
        <Button
          className={`border border-[#002869] bg-white px-12 py-6 font-bold ${
            enviandoDetallePago ? "text-gray-400" : "text-[#002869]"
          }`}
          onClick={() => {
            if (!enviandoDetallePago) {
              setMostrarModalTipoGasto(false);
            }
          }}
          disabled={enviandoDetallePago}
        >
          Regresar
        </Button>

        <Button
          className={`w-full px-8 py-5 font-bold sm:w-auto sm:px-12 sm:py-6 ${
            enviandoDetallePago
              ? "bg-gray-300 text-gray-500"
              : "bg-[#0090D1] text-white hover:bg-[#007bb3]"
          }`}
          onClick={validarFallecidoCertificadoGastos}
          disabled={enviandoDetallePago}
        >
          {enviandoDetallePago ? "Validando..." : "Continuar"}
        </Button>
      </div>
    </div>
  </div>
)}



          


    </main>
  );
}