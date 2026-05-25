.PHONY: paper clean

paper:
	pdflatex paper.tex
	bibtex paper
	pdflatex paper.tex
	pdflatex paper.tex

clean:
	rm -f *.aux *.bbl *.blg *.log *.out *.pdf
