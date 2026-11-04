# Guía de contribución

## Flujo de trabajo

1. Cree un issue o tome uno del tablero.
2. Cree una rama desde `main` con el formato `tipo/descripcion-corta`, por ejemplo `feat/cookie-httponly`, `fix/login-401`, `docs/diagramas`, `test/e2e-auth`.
3. Haga commits pequeños con mensajes en formato [Conventional Commits](https://www.conventionalcommits.org/es/): `feat(auth): ...`, `fix(auth): ...`, `test(auth): ...`, `docs: ...`, `chore: ...`.
4. Antes de abrir el pull request, ejecute las pruebas: `cd src/backend && pnpm test` y `cd src/frontend && pnpm test`.
5. Abra el pull request hacia `main` con la plantilla, enlace el issue y pida la revisión de otro integrante. El CI debe estar en verde.

## Documentación

Los cambios que afecten la arquitectura (componentes, dependencias entre módulos o atributos de calidad) se documentan en [`docs/`](docs/).

## Estilo

- Finales de línea LF (`.gitattributes` y `.editorconfig`); en el Backend se usa Prettier (`src/backend/.prettierrc`).
- No se versionan archivos `.env`: use las plantillas `.env.template`.
