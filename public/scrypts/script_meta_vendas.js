const idsValidos = [
  15102988390, 15104227133, 15104022626, 15102988260, 15103180033,
  15103323507, 15106965891, 14316562699, 15101996841, 15103135847,
  15102988191, 15104300347, 15102642266, 14316243535, 15102242030,
  14316243464, 15103136599, 15101873294, 15107363711, 15103131838,
  15105999702, 15105613261
];

let categoriaSelecionada = 'geral';
let metas = {
  geral: 2500000,
  armer: 937500,
  az: 715000,
  outros: 847500
};

const hoje = new Date();
const mesAtual = hoje.getMonth();
const anoAtual = hoje.getFullYear();
const ultimoDiaDoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();

let chartMeta, chartFaturamento;

Chart.register({
  id: 'centerText',
  beforeDraw(chart) {
    const { width, height } = chart;
    const ctx = chart.ctx;
    const pluginOpts = chart.config.options.plugins.centerText;
    if (!pluginOpts) return;

    const { realizado, projetado, meta } = pluginOpts;
    const porcentagemProjecao = Math.round((projetado / meta) * 100);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#3498db';
    ctx.fillText(`PROJEÇÃO`, width / 2, height / 2 - 15);
    ctx.fillText(`${porcentagemProjecao}%`, width / 2, height / 2 + 5);

    ctx.font = 'normal 18px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText('REALIZADO', width / 2, height / 2 + 35);

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#3498db';
    ctx.fillText(`R$ ${realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, width / 2, height / 2 + 55);
    ctx.restore();
  }
});

async function buscarNotas() {
  try {
    const detalhesCacheados = await fetch('https://metas-koala.onrender.com/api/nfe-cache')
      .then(res => res.json())
      .catch(() => ({}));

    const detalhes = Object.values(detalhesCacheados || {});

    const notasFiltradas = detalhes.filter(nf => {
      const data = nf?.data?.dataEmissao;
      const natureza = nf?.data?.naturezaOperacao?.id;
      if (!data || !natureza) return false;

      const dataEmissao = new Date(data);
      if (
        dataEmissao.getFullYear() !== anoAtual ||
        dataEmissao.getMonth() !== mesAtual ||
        !idsValidos.includes(natureza)
      ) return false;

      const itens = nf?.data?.itens || [];

      if (categoriaSelecionada === 'armer') {
        return itens.some(i => i.codigo?.toUpperCase().includes('ARMER'));
      } else if (categoriaSelecionada === 'az') {
        return itens.some(i => i.codigo?.toUpperCase().includes('AZ'));
      } else if (categoriaSelecionada === 'outros') {
        return itens.every(i =>
          !i.codigo?.toUpperCase().includes('AZ') &&
          !i.codigo?.toUpperCase().includes('ARMER')
        );
      }

      return true; // geral
    });

    const realizado = notasFiltradas.reduce((soma, nf) => soma + (nf?.data?.valorNota || 0), 0);
    const proporcao = hoje.getDate() / ultimoDiaDoMes;
    const projetado = realizado / proporcao;

    renderizarGraficoMeta(realizado, projetado, metas[categoriaSelecionada]);
    gerarTopProdutos(notasFiltradas);
    gerarGraficoFaturamentoDiario(notasFiltradas);
  } catch (err) {
    console.error('Erro ao buscar notas:', err);
  }
}

function renderizarGraficoMeta(realizado, projetado, meta) {
  const ctx = document.getElementById('chartMetaGeral').getContext('2d');

  if (chartMeta) chartMeta.destroy();

  const realizadoPercentual = Math.min(realizado / meta, 1);
  const projetadoPercentual = projetado / meta;

  const data = projetado >= meta
    ? [100, 0, 0]
    : [
        realizadoPercentual * 100,
        Math.max(0, (projetadoPercentual - realizadoPercentual) * 100),
        Math.max(0, 100 - Math.min(projetadoPercentual, 1) * 100)
      ];

  chartMeta = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Realizado', 'Projeção', 'Restante'],
      datasets: [{
        data,
        backgroundColor: ['#2ecc71', 'rgba(52, 152, 219, 0.5)', '#e5e5e5'],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180,
      rotation: 270,
      cutout: '80%',
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${ctx.raw.toFixed(1)}%`
          }
        },
        centerText: {
          realizado,
          projetado,
          meta
        }
      }
    }
  });

  const gap = meta - realizado;
  document.getElementById('grafico-gap').innerHTML =
    `GAP<br><span style="color: ${gap >= 0 ? '#c0392b' : '#27ae60'}; font-size: 16px;">R$ ${Math.abs(gap).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`;
  document.getElementById('grafico-projecao').innerHTML =
    `PROJEÇÃO<br><span style="color: #2980b9; font-size: 16px;">R$ ${projetado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>`;
}

function gerarTopProdutos(notas) {
  const produtos = {};

  notas.forEach(nf => {
    (nf?.data?.itens || []).forEach(item => {
      const nome = item.codigo;
      const qtd = item.quantidade || 0;
      const valor = item.valor || 0;

      if (!nome) return;

      if (!produtos[nome]) {
        produtos[nome] = { qtd: 0, total: 0 };
      }

      produtos[nome].qtd += qtd;
      produtos[nome].total += valor * qtd;
    });
  });

  const lista = Object.entries(produtos).map(([nome, dados]) => ({
    nome,
    qtd: dados.qtd,
    ticket: dados.total / dados.qtd
  }));

  const mais = [...lista].sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  const menos = [...lista].sort((a, b) => a.qtd - b.qtd).slice(0, 5);

  function renderTabela(lista, idTabela) {
    const tbody = document.querySelector(`#${idTabela} tbody`);
    tbody.innerHTML = '';
    lista.forEach(produto => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${produto.nome}</td>
        <td>${produto.qtd}</td>
        <td>R$ ${produto.ticket.toFixed(2).replace('.', ',')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderTabela(mais, 'ranking-mais-vendidos');
  renderTabela(menos, 'ranking-menos-vendidos');
}

function gerarGraficoFaturamentoDiario(notas) {
  const porDia = {};

  notas.forEach(nf => {
    const data = new Date(nf?.data?.dataEmissao);
    const dia = data.getDate();
    const valor = nf?.data?.valorNota || 0;
    porDia[dia] = (porDia[dia] || 0) + valor;
  });

  const dias = Array.from({ length: ultimoDiaDoMes }, (_, i) => i + 1);
  const valores = dias.map(d => porDia[d] || 0);

  const ctx = document.getElementById('chartFaturamentoDiario').getContext('2d');

  if (chartFaturamento) chartFaturamento.destroy();

  chartFaturamento = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dias,
      datasets: [{
        label: 'Faturamento Diário',
        data: valores,
        borderColor: '#2ecc71',
        backgroundColor: 'rgba(46, 204, 113, 0.2)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          title: { display: true, text: 'Dia do mês', color: '#fff' },
          ticks: { color: '#ecf0f1' }
        },
        y: {
          title: { display: true, text: 'R$', color: '#fff' },
          ticks: {
            color: '#ecf0f1',
            callback: value => `R$ ${value.toLocaleString('pt-BR')}`
          }
        }
      }
    }
  });
}

function atualizarLogo(categoria) {
  const logo = document.getElementById('logoCategoria');
  switch (categoria) {
    case 'geral':
      logo.src = '../images/logo_koalaBrands.png';
      logo.alt = 'Logo Koala Brands';
      logo.style.display = 'block';
      break;
    case 'armer':
      logo.src = '../images/logo_Armer.png';
      logo.alt = 'Logo Armer';
      logo.style.display = 'block';
      break;
    case 'az':
      logo.src = '../images/logo_AzAudio.png';
      logo.alt = 'Logo AZ Audio';
      logo.style.display = 'block';
      break;
      case 'outros':
        logo.src = '../images/logo_koalaBrands.png';
        logo.alt = 'Logo Koala Brands';
        logo.style.display = 'block';
        break;
    default:
      logo.src = '';
      logo.alt = '';
      logo.style.display = 'none';
  }
}

document.getElementById('botaoAtualizar')?.addEventListener('click', async () => {
  const botao = document.getElementById('botaoAtualizar');
  botao.disabled = true;
  botao.innerText = 'Atualizando...';

  try {
    const res = await fetch('https://metas-koala.onrender.com/api/atualizar-notas');
    const json = await res.json();
    alert(json.mensagem || 'Atualização concluída!');
    location.reload();
  } catch (err) {
    console.error('Erro ao atualizar:', err);
    alert('Erro ao atualizar os dados.');
  }

  botao.disabled = false;
  botao.innerText = 'Atualizar Dados';
});

document.querySelectorAll('.botao-menu').forEach(botao => {
  botao.addEventListener('click', () => {
    categoriaSelecionada = botao.dataset.categoria;
    document.body.className = categoriaSelecionada;

    document.querySelectorAll('.botao-menu').forEach(b => b.classList.remove('ativo'));
    botao.classList.add('ativo');

    atualizarLogo(categoriaSelecionada); // 👈 Atualiza logo
    buscarNotas();
  });
});

// Menu hamburguer
const hamburguer = document.getElementById('hamburguer');
const menuSlide = document.getElementById('menuSlide');
const fecharMenu = document.getElementById('fecharMenu');

hamburguer.addEventListener('click', () => {
  menuSlide.classList.add('aberto');
});

fecharMenu.addEventListener('click', () => {
  menuSlide.classList.remove('aberto');
});

// Inicialização
atualizarLogo(categoriaSelecionada); // 👈 Logo ao iniciar
buscarNotas();
