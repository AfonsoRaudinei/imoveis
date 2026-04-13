# Simulador de Leiloes - Execucao

## Rodar local

Use um servidor HTTP simples na raiz do projeto:

```bash
cd "/Users/raudineisilvapereira/dev/IMOVEIS LEILAO"
python3 -m http.server 8080
```

Acesse:

- App: `http://localhost:8080/app/`
- Docs: `http://localhost:8080/docs/`

## Publicar no GitHub Pages

Estrutura recomendada no repositório:

- `/app` para a aplicacao
- `/docs` para documentacao

Se o Pages estiver apontando para a raiz, `docs/index.html` vira a central de acesso.
