# Dashboard Ranking em PHP

Sistema de ranking de grupos feito para hospedagem compartilhada com PHP, como
os planos da Hostinger que nao possuem Node.js.

## Funcionalidades

- Ranking publico com destaque para o TOP 3.
- Filtro por turma.
- Painel administrativo com login e sessao PHP.
- Cadastro e exclusao de grupos.
- Alteracao de pontuacao com `+100`, `+50`, `+10`, `-10`, `-50` e `-100`.
- Pontuacao minima travada em `0`.
- Bloqueio de grupos duplicados na mesma turma.
- Desempate mantendo na frente quem ja estava na frente antes.
- Dados salvos em arquivos `.txt`.
- Log filtrado salvo em `server.log`.
- Versao e build visiveis no canto da pagina.

## Requisitos

- PHP 8.0 ou superior.
- Apache ou LiteSpeed com `mod_rewrite`.
- Permissao de escrita na pasta `data`.

Nao precisa executar `npm install` ou `npm start`.

## Testar Localmente no Windows

Instale o XAMPP, que ja inclui PHP. Depois, dentro da pasta do projeto, rode:

```powershell
C:\xampp\php\php.exe -S localhost:8000 router.php
```

Depois da instalacao, tambem e possivel iniciar dando dois cliques em:

```txt
iniciar.bat
```

Abra:

```txt
http://localhost:8000
http://localhost:8000/superadminana.html
http://localhost:8000/api/version
```

Para conferir a sintaxe do backend:

```powershell
C:\xampp\php\php.exe -l api.php
C:\xampp\php\php.exe -l router.php
```

O `router.php` e usado somente no teste local. A Hostinger usa o `.htaccess`.

## Publicar na Hostinger

Envie o conteudo deste projeto para a pasta `public_html`:

```txt
.htaccess
api.php
public/
data/
```

No Gerenciador de Arquivos da Hostinger:

1. Confirme que `.htaccess` foi enviado. Arquivos iniciados com ponto podem
   ficar ocultos.
2. Deixe a pasta `data` com permissao de escrita. Normalmente `755` funciona;
   se o PHP nao conseguir salvar, teste `775`.
3. Se `data/admin.txt` nao existir, o PHP cria o arquivo automaticamente com a
   senha inicial `admin123`.
4. Entre no painel e altere a senha inicial.

O ranking publico fica em:

```txt
https://seu-dominio.com/
```

O painel administrativo fica em:

```txt
https://seu-dominio.com/superadminana.html
```

Para conferir qual versao realmente esta publicada:

```txt
https://seu-dominio.com/api/version
```

## Arquivos de Dados

```txt
data/admin.txt
data/ranking.txt
```

- `admin.txt` guarda somente o hash da senha.
- `ranking.txt` guarda grupos, pontos e ordem do ranking.
- `data/.htaccess` bloqueia acesso direto aos arquivos pelo navegador.

Tudo que for alterado no computador ou celular pelo site hospedado sera salvo
nesses arquivos do servidor.

## Logs

Os eventos importantes e erros ficam em:

```txt
server.log
```

O arquivo e criado automaticamente. Se algo nao salvar, procure linhas com
`ERRO ARQUIVO` ou `ERRO SERVIDOR`.

O `.htaccess` bloqueia o acesso ao log pelo navegador.

## Senha Existente

O backend PHP aceita o hash PBKDF2 criado pela versao antiga em Node.js. Ao
alterar a senha pelo painel, ela passa a usar o hash seguro nativo do PHP.

## Estrutura

```txt
data/
  .htaccess
  admin.txt
  ranking.txt
public/
  index.html
  superadminana.html
  styles.css
.htaccess
api.php
iniciar.bat
router.php
README.md
```

Os arquivos `server.js`, `package.json` e `package-lock.json` nao sao mais
necessarios.

O `router.php` pode ficar no projeto, mas serve apenas para executar o teste
local com o servidor embutido do PHP.

## Testar no Render

O Render nao possui runtime PHP nativo. Para testar nele, crie um novo
**Web Service** usando a opcao **Docker**. O `Dockerfile` deste projeto instala
PHP 8.2 com Apache automaticamente.

Nao configure `npm install`, Build Command ou Start Command. O Docker cuida
dessas etapas.

No plano gratuito do Render, alteracoes feitas em `ranking.txt` e `admin.txt`
podem ser perdidas quando o servico reiniciar ou receber um novo deploy. Na
Hostinger com armazenamento persistente, os arquivos permanecem salvos.
